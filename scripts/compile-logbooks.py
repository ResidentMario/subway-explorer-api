"""
This dot-py file defines a CLI for reading a day's worth of GTFS-R records on disc into a SQLite database containing
only complete trips.
"""

import click
import os
from datetime import datetime, timedelta
from google.transit import gtfs_realtime_pb2
import gtfs_tripify as gt
from tqdm import tqdm
import sqlite3
import pandas as pd


FEED_IDENTIFIERS = [1, 2, 11, 16, 21, 26, 31, 36]
LOG_CUT_HEURISTIC_EXCEPTIONS = ['GS']
POST_END_OF_DAY_CUTOFF = 3


@click.command()
@click.argument('root')
@click.argument('date')
@click.argument('out')
def run(root, date, out):
    """
    Specify a date (in %Y-m-d format, e.g. "2018-01-17") and an output folder, and...
    """
    # import pdb; pdb.set_trace()
    conn = sqlite3.connect("{0}/logbooks.sqlite".format(out))

    for feed_number in FEED_IDENTIFIERS:

        # Date format munging.
        feed_root = "{0}/mta-gtfs-{1}".format(root, feed_number)
        date = datetime.strptime(date, "%Y-%m-%d")
        day_after = date + timedelta(days=1)
        day_after_terminus = datetime(day_after.year, day_after.month, day_after.day, POST_END_OF_DAY_CUTOFF)
        day_after_root = "{0}/{1}".format(feed_root, day_after.strftime('%Y-%m-%d'))

        # Raise an error if there is not enough follow-on data.
        if not os.path.isdir(day_after_root):
            raise IOError("In order to account for trips that transition through day's end, please provide "
                          "six hour's of data from the day following the chosen day.")

        if day_after.strftime('%Y-%m-%d') + "_06" not in [fn[:13] for fn in os.listdir(day_after_root)]:
            raise IOError("In order to account for trips that transition through day's end, please provide "
                          "six hour's of data from the day following the chosen day.")

        # Get the relevant feeds.
        relevant_day_after_files = ["{0}/{1}".format(day_after_root, fn) for fn in os.listdir(day_after_root)
                                    if fn < "{0}_06".format(day_after_terminus.strftime('%Y-%m-%d'))]
        relevant_day_after_files = sorted(relevant_day_after_files)
        relevant_day_of_files = sorted(os.listdir("{0}/{1}".format(feed_root, date.strftime("%Y-%m-%d"))))
        relevant_day_of_files = ["{0}/{1}/{2}".format(feed_root,
                                                      date.strftime('%Y-%m-%d'), f) for f in relevant_day_of_files]
        feeds = relevant_day_of_files + relevant_day_after_files

        # Built the logbook.
        feeds = [parse_feed(feed) for feed in tqdm(feeds)]
        feeds = [feed for feed in feeds if feed is not None]

        feeds = [gt.dictify(feed) for feed in tqdm(feeds)]

        logbook = gt.logify(feeds)

        # Cut cancelled and incomplete trips from the logbook. Note that we exclude shuttles.
        for trip_id in tqdm(logbook.keys()):
            if len(logbook[trip_id]) > 0 and logbook[trip_id].iloc[0].route_id not in LOG_CUT_HEURISTIC_EXCEPTIONS:
                logbook[trip_id] = gt.utils.cut_cancellations(logbook[trip_id])

        logbook = gt.utils.discard_partial_logs(logbook)

        # Cut empty trips and trips that began on the follow-on day.
        trim = logbook.copy()
        import pdb; pdb.set_trace()
        for trip_id in tqdm(logbook.keys()):
            if len(logbook[trip_id]) == 0:
                del trim[trip_id]
            else:
                start_ts = logbook[trip_id].iloc[0]['latest_information_time']
                if datetime.fromtimestamp(int(start_ts)).day != date.day:
                    del trim[trip_id]

        del logbook

        # Write out to a SQLite database.
        pd.concat(trim[trip_id] for trip_id in trim.keys()).to_sql('Logbooks', conn, if_exists='append')


def parse_feed(filepath):
    """Helper function for reading a feed in using Protobuf. Handles bad feeds by replacing them with None."""
    with open(filepath, "rb") as f:
        try:
            fm = gtfs_realtime_pb2.FeedMessage()
            fm.ParseFromString(f.read())
            return fm
        except (KeyboardInterrupt, SystemExit):
            raise
        except:
            return None


if __name__ == '__main__':
    run()
