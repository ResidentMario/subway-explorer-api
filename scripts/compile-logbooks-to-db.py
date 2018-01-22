"""
This dot-py file defines a CLI for reading a given time period's worth of GTFS-R records on disc into a SQLite database
containing only complete trips. It assumes that the data has already been localized onto disc using the
`push-stops.py` script (or an equivalent).

E.g. how I've been using it:

> python compile-logbooks.py ~/Desktop/subway-explorer-datastore/ '2018-01-18T00:00' '2018-01-18T12:00' .
"""

import click
import os
from datetime import datetime, timedelta
from google.transit import gtfs_realtime_pb2
import gtfs_tripify as gt
from tqdm import tqdm
import sqlite3
import warnings


FEED_IDENTIFIERS = [1, 2, 11, 16, 21, 26, 31, 36]
LOG_CUT_HEURISTIC_EXCEPTIONS = ['GS']
TERMINUS_TIME = 3


@click.command()
@click.argument('root')
@click.argument('start_time')
@click.argument('end_time')
@click.argument('out')
def run(root, start_time, end_time, out):
    """
    Specify a date (in %Y-%m-%d_%H:%M format, e.g. "2018-01-17_21:00"; a slight variant on the recommended ISO datetime
    format using a "_" instead of a "T").
    """
    # import pdb; pdb.set_trace()
    conn = sqlite3.connect("{0}/logbooks.sqlite".format(out))

    for feed_id in FEED_IDENTIFIERS:

        print("Starting work on the feed with the ID '{0}'".format(feed_id))
        # Date format munging.
        feed_root = "{0}/mta-gtfs-{1}".format(root, feed_id)
        start_datetime = datetime.strptime(start_time, "%Y-%m-%dT%H:%M")
        end_datetime = datetime.strptime(end_time, "%Y-%m-%dT%H:%M")
        read_in_terminus = end_datetime + timedelta(hours=TERMINUS_TIME)
        day_of_root = "{0}/{1}".format(feed_root, start_datetime.strftime("%Y-%m-%d"))
        day_after_root = "{0}/{1}".format(feed_root, (start_datetime + timedelta(days=1)).strftime('%Y-%m-%d'))

        # TODO: Raise an error if there is not enough follow-up data to complete trips that extend past the end time.
        # Raise an error if there is not enough follow-on data.
        # if not os.path.isdir(day_after_root):
        #     raise IOError("In order to account for trips that transition through day's end, please provide "
        #                   "six hour's of data from the day following the chosen day.")

        # Get the relevant feeds.
        #
        # In order to convert all of the GTFS-R messages into a unified trip log we need to read the overall GTFS-R
        # stream in chunks. The maximum size of the chunks that we use will be restricted by how much memory the
        # machine doing the processing has: a single day of data on a busy feed can very nearly max out 16 GB of RAM
        # (dictity in particular suffers from extremely regressive memory profile performance; this was definitely
        # not true when I initially wrote it, and definitely something I need to investigate in great detail
        # eventually).
        #
        # OK, so we need to read the data in chunks. How big should the chunks be? Our end goal is to create a
        # database with complete stop records for every trip. Trips that fall exactly inside of our desired stop and
        # end time are easy: we have all the information we need. But trips that intersect on the edges are hard. We
        # don't want to include partial trip information in our database, only complete trip information. How do we
        # deal with it?
        #
        # To run this script we define a `start_time` and a `stop_time`. The result that gets written to the database
        # will be this: every trip that *starts* in between `start_time` and `stop_time`. This includes trips that
        # actually do not finish until (potentially well) past the `stop_time` we've specified.
        #
        # We achieve this by defining a timedelta of additional records we'll read in that extends past the
        # `stop_time`. In this script I've arbitrarily chosen three hours as that value, on the hypothesis that no
        # train trip could possible take more than three hours to complete.
        #
        # At runtime, this script calculates a stop time three hours after the specified `stop_time`. It figures out
        # what logs correspond with that additional information, and appends them to the logs to be read.
        #
        # Then, after we've done all of the heavy lifting with `gtfs-tripify`, including cutting out partial trips,
        # we'll have a logbook with two kinds of trips: trips that started in between `start_time` and `stop_time`,
        # and trips that started after `stop_time`, but finished before `stop_time` + 3 hours. The last thing we'll
        # need to do will be removing the latter category of things. This is easy to do: check the individual logs
        # and make sure that the trip timestamps start in between `start_time` and `stop_time`. Any trips whose first
        # timestamp is post-`stop time` is undesirable and we'll throw it out.
        #
        # The end result is that the data we write to the database is neatly contiguous: it's every trip that started
        # in between `start_time` and `stop_time`. We can pick whatever chunk size we want: six hours, half a day,
        # or a full day, whatever, and execute this script on each chunk of time to push those trips to the database.
        # Obviously though, because of the fixed costs, bigger is better.
        feeds = []
        possibly_relevant_feeds = sorted(os.listdir(day_of_root))
        for fp in possibly_relevant_feeds:
            dt = datetime.strptime(":".join(fp.split(":")[:2]), "%Y-%m-%d_%H:%M")
            if dt < read_in_terminus:
                feeds.append('{0}/{1}'.format(day_of_root, fp))

        more_possibly_relevant_feeds = sorted(os.listdir(day_after_root))
        for fp in more_possibly_relevant_feeds:
            dt = datetime.strptime(":".join(fp.split(":")[:2]), "%Y-%m-%d_%H:%M")
            if dt < read_in_terminus:
                feeds.append('{0}/{1}'.format(day_after_root, fp))

        # Built the logbook.
        print("Parsing feeds into buffers...")
        feeds = [parse_feed(feed) for feed in tqdm(feeds)]
        feeds = [feed for feed in feeds if feed is not None]

        print("Converting feeds into dictionaries...")
        feeds = [gt.dictify(feed) for feed in tqdm(feeds)]

        print("Building the logbook...")
        logbook = gt.logify(feeds)
        del feeds

        # Cut cancelled and incomplete trips from the logbook. Note that we must exclude shuttles.
        print("Trimming cancelled and incomplete stops...")
        for trip_id in tqdm(logbook.keys()):
            if len(logbook[trip_id]) > 0 and logbook[trip_id].iloc[0].route_id not in LOG_CUT_HEURISTIC_EXCEPTIONS:
                logbook[trip_id] = gt.utils.cut_cancellations(logbook[trip_id])

        logbook = gt.utils.discard_partial_logs(logbook)

        # Cut empty trips and trips that began on the follow-on day.
        print("Cutting cancelled and follow-on-day trips...")
        trim = logbook.copy()
        for trip_id in tqdm(logbook.keys()):
            if len(logbook[trip_id]) == 0:
                del trim[trip_id]
            else:
                start_ts = logbook[trip_id].iloc[0]['latest_information_time']
                if datetime.fromtimestamp(int(start_ts)).day != start_datetime.day:
                    del trim[trip_id]

        del logbook

        print("Writing to SQL...")
        gt.utils.to_sql(trim, conn)

        print("Done!")


def parse_feed(filepath):
    """Helper function for reading a feed in using Protobuf. Handles bad feeds by replacing them with None."""
    with warnings.catch_warnings():
        warnings.simplefilter("error")

        with open(filepath, "rb") as f:
            try:
                fm = gtfs_realtime_pb2.FeedMessage()
                fm.ParseFromString(f.read())
                return fm
            except (KeyboardInterrupt, SystemExit):
                raise
            # Protobuf occasionally raises an unexpected tag RuntimeWarning. This sometimes occurs when a feed that we
            # read is in an inconsistent state (the other option is a straight-up exception). It's just a warning,
            # but it corresponds with data loss, and `gtfs-tripify` should not be allowed to touch the resulting
            # message --- it will take the non-presence of certain trips no longer present in the database at the
            # given time as evidence of trip ends. We need to explicitly return None for the corresponding messages
            # so they can be totally excised.
            # See https://groups.google.com/forum/#!msg/mtadeveloperresources/9Fb4SLkxBmE/BlmaHWbfw6kJ
            except RuntimeWarning:
                return None
            except:
                return None


if __name__ == '__main__':
    run()
