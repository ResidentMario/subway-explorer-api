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

    # TODO: expose the bound as a script input variable instead of hard-coding it.
    # This boundary safely corresponds with ~a full day of data. Do not try to run this script without enough data!!!
    # In practice, this is where domain expertise on the orientation of the subway system should come in. For now, this
    # heuristic is enough.
    regular_stops = c.execute(
"""
  SELECT route_id, stop_id 
    FROM (SELECT route_id, COUNT(route_id) AS n_stops, stop_id 
          FROM Logbooks 
          GROUP BY stop_id, route_id) AS stop_routes
    WHERE stop_routes.n_stops >= 100;
""").fetchall()

    df = (
        pd.DataFrame(regular_stops, columns=['route_id', 'stop_id'])
        .set_index('stop_id').join(df.set_index('stop_id'), how='left')
        .reset_index()
    )
    conn.commit()

    # Ensure column order.
    df[['stop_id', 'stop_name', 'stop_lat', 'stop_lon', 'authority_start_time',
        'authority_end_time', 'route_id']].to_sql("Stops", conn, if_exists='append')


if __name__ == '__main__':
    run()
