"""
This dot-py file defines a CLI for exporting relevant bits of a GTFS feed to the database. Specifically, this script
can be used to export the `stops.txt` component of a GTFS feed to a table in the database.

It's necessary to have and to run this script because we need to resolve human-readable stop information (like
"Sheepshead Bay Road") to machine-readable stop information (like "29N") as a part of the front-end telemetry. The
table generates by this CLI is used to fulfill those requests.

Usage is via something along the lines of:

> python compile-gtfs-feed-to-db.py ~/Downloads/google_transit.zip "2018-01-01T00:00" "2018-04-01T00:00" logbooks.sqlite

The timestamps are start and stop points for the authoritativeness of the GTFS feed being read in. GTFS feeds change
once a season, at which point the authoritativeness of the old one ends and that of a new one begins.
"""

import click
import requests
import sqlite3
import os
from zipfile import ZipFile
import io
import pandas as pd
from datetime import datetime


@click.command()
@click.argument('gtfs')
@click.argument('authority_start_time')
@click.argument('authority_end_time')
@click.argument('db')
def run(gtfs, authority_start_time, authority_end_time, db):
    """
    TODO: docstring
    """
    if os.path.exists(gtfs):
        zf = ZipFile(gtfs, "r")
    else:
        zf = ZipFile(io.BytesIO(requests.get(gtfs).content), "r")

    zfc = zf.open("stops.txt").read().decode('utf-8')

    import pdb; pdb.set_trace()

    df = pd.read_csv(io.StringIO(zfc))
    df = df.assign(authority_start_time=datetime.strptime(authority_start_time, "%Y-%m-%dT%H:%M").timestamp(),
                   authority_end_time=datetime.strptime(authority_end_time, "%Y-%m-%dT%H:%M").timestamp())
    conn = sqlite3.connect(db)
    df.to_sql("Stops", conn, if_exists='append', index=False)


if __name__ == '__main__':
    run()
