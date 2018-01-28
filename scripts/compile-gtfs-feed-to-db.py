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

    stime = datetime.strptime(authority_start_time, "%Y-%m-%dT%H:%M").timestamp()
    etime = datetime.strptime(authority_end_time, "%Y-%m-%dT%H:%M").timestamp()

    # Hack in an index. The Node.JS ORM I am using assumes we create some sort of index.
    utime = stime + (etime - stime) - 1522555000

    df = pd.read_csv(io.StringIO(zfc))
    df = df.assign(authority_start_time=stime,
                   authority_end_time=etime,
                   authority_id=df.index.map(lambda v: int("{0}{1}".format(utime, v).strip('0').replace(".", "")))
                   ).set_index('authority_id')
    df = df[df.stop_id.map(lambda s: not s[-1].isdigit())]
    conn = sqlite3.connect(db)
    c = conn.cursor()

    # Create a temporary table for assigning values to. This is an unsightly hack.
    # TODO: Find a better way to do this.
    df.to_sql("StopsTemp", conn, if_exists='append')
    dominant_routes = c.execute(
"""
    SELECT stop_routes.route_id
        FROM (StopsTemp
            LEFT JOIN 
                (SELECT route_id, COUNT(route_id), stop_id 
                FROM Logbooks 
                GROUP BY stop_id) AS stop_routes 
            ON StopsTemp.stop_id = stop_routes.stop_id);
"""
    ).fetchall()
    dominant_routes = [d[0] for d in dominant_routes]
    df = df.assign(route_id=dominant_routes)
    c.execute("DROP TABLE StopsTemp;")
    conn.commit()

    df[['stop_id', 'stop_name', 'stop_lat', 'stop_lon', 'authority_start_time',
        'authority_end_time', 'route_id']].to_sql("Stops", conn, if_exists='append')


if __name__ == '__main__':
    run()
