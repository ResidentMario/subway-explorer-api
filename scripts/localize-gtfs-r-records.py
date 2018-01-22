"""
This dot-py file defines a CLI for exporting GTFS-R records from AWS Lambda. It assumes that the `awscli` package is
installed and configured (via `aws configure`) in the current environment. For more information on configuration see
https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-getting-started.html.

This CLI is just a simple wrapper that runs a sequence of `awscli` commands with the following pattern:
> aws s3 sync s3://mta-gtfs-1 . --exclude "*" --include "*2018-01-17*"

Use it to retrieve all GTFS-R records within a certain set time period.

E.g. how I've been using it:

> python localize-gtfs-r-records.py '2018-01-19' ~/Desktop/subway-explorer-datastore/
"""

import click
import subprocess
import os
import shutil


@click.command()
@click.argument('date')
@click.argument('out')
@click.option('--dryrun', is_flag=True)
def run(date, out, dryrun):
    """
    Specify a date (in %Y-m-d format, e.g. "2018-01-17") and an output folder, and this script will push that day's
    worth of GTFS-R records into the requisite folder.

    To perform a dry run (test if this script is working) additionally specify the --dryrun flag.
    """
    for feed_number in [1, 2, 11, 16, 21, 26, 31, 36]:
        # import pdb; pdb.set_trace()
        # https://stackoverflow.com/q/48358992/1993206
        commands = ["aws", "s3", "sync", "s3://mta-gtfs-{0}".format(feed_number), ".", "--exclude", '*',
                    "--include", '*{0}*'.format(date)]
        if dryrun:
            commands.append("--dryrun")

        # import pdb; pdb.set_trace()
        subprocess.run(commands)

        try:
            os.mkdir(out)
        except FileExistsError:
            pass
        try:
            os.mkdir("{0}/mta-gtfs-{1}".format(out, feed_number))
        except FileExistsError:
            pass
        try:
            os.mkdir("{0}/mta-gtfs-{1}/{2}".format(out, feed_number, date))
        except FileExistsError:
            pass

        for f in [f for f in os.listdir(".") if 'pb' in f]:
            shutil.move(f, "{0}/mta-gtfs-{1}/{2}/{3}".format(out, feed_number, date, f))


if __name__ == '__main__':
    run()
