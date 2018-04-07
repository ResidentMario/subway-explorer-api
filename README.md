## About 

The [Metropolitan Transit Authority](https://en.wikipedia.org/wiki/Metropolitan_Transportation_Authority) is the 
primary public transportation authority for the greater New York City region. It provides real-time information about 
its buses, subway trains, and track trains using a bundle of what are called [GTFS-Realtime 
feeds](https://developers.google.com/transit/gtfs-realtime/). Each GTFS-RT feed represents a snapshot of a slice of the 
MTA's service jurisdiction at a certain timestamp.

This repository comprises:

* Scripts for pouring archived MTA GTFS-Realtime data into a `sqlite` database of station arrival and departure times (using 
the [`gtfs-tripify`](https://github.com/ResidentMario/gtfs-tripify) library and some glue code).
* An Express Node.JS application serving an API based on that data.

The [`subway-explorer-webapp`](https://github.com/ResidentMario/subway-explorer-webapp) repository defines a model web application using this API.

## Quickstart

You will need to have [Node.JS](https://nodejs.org/en/) installed and configured.

Clone this repository:

```sh
git clone https://github.com/ResidentMario/subway-explorer-api
```

Create an `.env` file in the root folder with a pointer to the database file.

```sh
DATABASE_FILEPATH=/path/to/your/database
```

You can download an example database (`logbook.sqlite`) from the 
[`subway-explorer-example-db`](https://github.com/ResidentMario/subway-explorer-example-db) repository.

To install the necessary packages and then spin the service up, run:

```sh
npm install
node index.js
```

The API will now listen for input on `http://localhost:3000/`.

There are two routes in the API. The first is `locate-stations`, which simply returns the station nearest a given 
latitude and longitude. If you visit the following URL in your local browser:

```
http://localhost:3000/locate-stations/json?line=1&x=-74.01&y=40.70&heading=N&time=2018-01-18T14:00
```

You will be served the following as `text/json`:

```
{"taxicab_dist":0.005731999999994741,
 "stop_id":"142N","stop_name":"South Ferry",
 "stop_lat":40.702068,
 "stop_lon":-74.013664,
 "authority_start_time":1514782800,
 "authority_end_time":1522555200}
```

The second and more interesting route is `poll-travel-times`. This route returns the most efficient trip between two 
stops (on the same line) possible at given timestamps. For example, if you visit the following URL:

```
http://localhost:3000/poll-travel-times/json?line=2&start=247N&end=220N&timestamps=2018-01-18T02:00
```

You will see:

```
[{"status":"OK",
  "results": 
    [
        {"event_id":10306,
         "trip_id":"014350_2..N08X010",
         "unique_trip_id":"014350_2..N08X010_426",
         "route_id":"2",
         "action":"STOPPED_OR_SKIPPED",
         "minimum_time":1516260172,
         "maximum_time":1516260232,
         "stop_id":"247N",
         "latest_information_time":"1516260232"},
        {...},
        ...
    ]
}]
```

To inspect multiple timestamps simultaneously, separate them using a pipe character `|`:

```
http://localhost:3000/poll-travel-times/json?line=2&start=247N&end=220N&timestamps=2018-01-18T02:00|2018-01-18T14:00
```

Note that this API expects input using station IDs assigned by the MTA, *not* human-readable station names. The 
`locate-stations` route is actually intended for transforming `(latitude, longitude)` pairs into station IDs 
programmatically. For experimenting with the API it's easier to search the `stops.txt` record in the [official MTA GTFS record](http://web.mta.info/developers/data/nyct/subway/google_transit.zip).

To shut the API down, enter `Ctrl+C` into the terminal console you launched in.

## Building a database

The `Quickstart` example uses a simple example database that was prepared in advance. To use this API properly, you will need to generate a proper database yourself. 
Before you start, make sure you have [Python](https://www.python.org/) installed on your machine. Then use `pip` to install the following required packages:

```sh
pip install git+git://github.com/ResidentMario/gtfs-tripify.git@master
pip install click
```

### Localizing data

The MTA publishes GTFS-Realtime data for every line in its system. This data is split up across several different feeds, each one of which updated every 30 seconds. This data is the raw input for this project, and if you want to do something similar you need to archive it somehow.

Unfortunately no public archives up-to-date archives exist; if you want to use this API for current data, you will need to archive the data yourself.

I've done this using an AWS Lambda function feeding into a packet of AWS S3 buckets, triggered by a AWS CloudWatch cron job running once a minute. A copy of the script doing this work is available as `aws-lambda-archiver.py` in the `scripts` folder. You can use this script to archive feeds up on AWS yourself.

The `localize-gtfs-r-records.py` script can download batches of relevant GTFS-Realtime fields:

    python localize-gtfs-r-records.py '2018-01-19' ~/Desktop/subway-explorer-datastore/
    
You must have the [AWS CLI](https://aws.amazon.com/cli/) installed (and [configured with your credentials](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-getting-started.html)) to run this script.
  
Note that the scripts and instructions in this section up to here are AWS specific. Any other cloud provider you prefer will do the job, but you will need to write your own pipeline, using this existing one as a template.

### Feeding in the realtime data

Then, the `compile-gtfs-feed-to-db.py` script writes that data to a database:

    python compile-logbooks-to-db.py ~/Desktop/subway-explorer-datastore/ '2018-01-18T00:00' '2018-01-18T12:00' .

Running this script (actually a thin wrapper on the `gt.io.stream_to_sql` module method) will add complete stop sequences which started within the inputted time period to the database.

The table entries created are contiguous, meaning that we can follow this run (on the first half of January 18, 2018) with a second run (on the second half of January 18, 2018) and get the same result we would have gotten if we had parameterized the script with the whole day (all of January 18, 2018) to begin win with.

To achieve this, the script "looks ahead" and parses data up to three hours after the given end date. So for the endpoint timestamp `2018-01-18T12:00`, the script will actually parse trips all the way up to `2018-01-18T15:00`. This is done to ensure that trips that started before the `2018-01-18T12:00` cutoff but ended some time after that are populated with their complete stop sequence (e.g. no projected `EXPECTED_TO_ARRIVE_AT` records).

In the future I may implement streaming support for `gtfs-tripify`, which would de-necessitate this ugly workaround (and unlock some other interesting use cases for this data stream besides). For now, keep in mind when running this script that you must have three extra hours of data available in order for the run to be successful.

Because of this high fixed cost, it is optimal to run this script on time chunks as large as your RAM limitations allow. 12-hour chunks are approximately optimal for a 16 GB machine. This may change in the future, but for now running this script is very expensive!

### Feeding in station identities

The database will also need relevant `GTFS` station records.

These are used to populate the station lookup code path in the API. The challenge is that the names and IDs of stations may change over time. So `stops.txt` from a `GTFS` roll-up must be written to the database with an `authority_start_time` and `authority_end_time`, to make sure that the given station is correct for the given time period. You can write this data using the `compile-gtfs-feed-to-db.py` script:

    python compile-gtfs-feed-to-db.py ~/Downloads/google_transit.zip "2018-01-01T00:00" "2018-04-01T00:00" logbooks.sqlite

Once you have all this your database will be ready to use. To run it, see the instructions in the [Quickstart](#Quickstart).

## Running the tests

To run the tests locally, `npm install mocha` if you haven't already, then run `npx mocha` from the root folder.

## Using the container

This repo contains a Docker file bundled with Node.JS and this application. I found the [Node.JS-Docker integration 
quickstart](https://nodejs.org/en/docs/guides/nodejs-docker-webapp/) very helpful in getting that set up, and it's a 
good reference on how to work with the containerized application.

To build the container image, run the following from the root folder:

    docker build -t residentmario/subway-explorer-api .

Then, to run the container (pointing it to `localhost:49160`):

    docker run -p 49160:3000 --env-file .env -d residentmario/subway-explorer-api

You can visit the following (port-forwarded) URI in the browser to verify that the connection is being served:

```
http://localhost:49160/locate-stations/json?line=1&x=-74.01&y=40.70&heading=N&time=2018-01-18T14:00
```


You can also run the tests by jumping inside the container and running `npx mocha`, using the following command:

    docker exec -it 949cc5d81abe /bin/bash

Replacing the name with the name of the running image (discoverable via `docker ps`).

This Docker container does not come with a database attached, so the API can't do anything useful right off the bat. 
To make it do something useful you can mount the database you created as a volume using Docker controls, or rely on 
linkage tooling in a cluster manager like Kubernetes (which is what I plan to did).
