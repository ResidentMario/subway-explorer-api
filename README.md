# About 

This repository comprises: 

* Scripts for pouring MTA GTFS-Realtime data into a `sqlite` database.
* An Express Node.JS application serving an API based on that data.

It is the backend component to the (WIP) Subway Explorer webapp.

## Setup

### Initializing the database

The first step to using this API is initializing the database.

The MTA publishes GTFS-Realtime data for every line in its system. This data is split up across several different 
feeds, each one of which updated every 30 seconds. This data is the raw input for this project, and if you want to 
do something similar you need to archive it somehow. I've done so using an AWS Lambda function feeding into a packet of 
AWS S3 buckets. The Lambda function I used to achieve this is available in this repository as 
`aws-lambda-archiver.py` in the `scripts` folder.

For testing purposes, you can use one of the GTFS-Realtime archives floating around on the Internet, which won't 
require setting up all this infrastructure ahead of time.

I hand-run the `localize-gtfs-r-records.py` script to download batches of relevant GTFS-Realtime fields. This script 
can be operated via:

    python localize-gtfs-r-records.py '2018-01-19' ~/Desktop/subway-explorer-datastore/
    
I then run `compile-gtfs-feed-to-db.py` to write that data to a historified database file. The heavy lifting is done 
by the [`gtfs_tripify`](https://github.com/ResidentMario/gtfs-tripify) package, and the end result is a `sqlite` 
database with the relevant information. You can run that yourself from the command line thusly:

    python compile-logbooks-to-db.py ~/Desktop/subway-explorer-datastore/ '2018-01-18T00:00' '2018-01-18T12:00' .

Running this script will add complete stop sequences which started within the inputted time period to the database 
(as the `Logbooks` table). A word of caution if you use these scripts: you must have some amount of data (three 
hours by default) extending past the stop time you specify when running this script. That data is used to write trips
that start in the given time frame, but end past it.

The database will also need relevant `GTFS` station records. These are used to populate a station lookup code path. 
The challenge is that the names and IDs of stations may change over time. So `stops.txt` from a `GTFS` roll-up must be 
written to the database with an `authority_start_time` and `authority_end_time`, to make sure that the given station 
is correct for the given time period. You can write this data using the `compile-gtfs-feed-to-db.py` script:

    python compile-gtfs-feed-to-db.py ~/Downloads/google_transit.zip "2018-01-01T00:00" "2018-04-01T00:00" logbooks.sqlite

Once you have all this your database will be ready to use. Make sure that the resulting database is named 
`logbooks.sqlite` and located in the root directory, next to the dot-js files.


### Running the API locally

To run the API locally, make sure you have Node.JS installed, along with the packages listed in `package.json`. This 
is easy to achieve by running `npm install` from the root directory.

Once you have that, to run the API locally, just do:

    node index.js

The application will be served from port 3000. You can see it in action by visiting `localhost:3000` in your web 
browser. Here are a couple of example URIs you can try to verify that the application is working (you'll need to 
adapt the timestamps and lines to match data you have in your database):

    http://localhost:3000/locate-stations/json?line=A&x=73.75&y=-73.75&heading=N&time=2018-01-18T12:00
    http://localhost:3000/poll-travel-times/json?line=2&start=247N&end=220N&timestamps=2018-01-18T02:00

### Running the tests locally

The application is split across three different files. `index.js` is the entry point, `db.js` defines the database 
ORM layer, and `api.js` defines the core API. Tests cover the core API, which the front-end is a thin wrapper around.
You can verify everything is peachy by running them via `npx mocha` from the root folder.

### Setting up a Docker container

This repo contains a Docker file bundled with Node.JS and this application. I found the [Node.JS-Docker integration 
quickstart](https://nodejs.org/en/docs/guides/nodejs-docker-webapp/) very helpful in getting that set up, and it's a 
good reference on how to work with the containerized application.

To build the container image, run the following from the root folder:

    docker build -t residentmario/subway-explorer-api .

Then, to run the container (pointing it to `localhost:49160`):

    docker run -p 49160:3000 -d residentmario/subway-explorer-api

You can visit the URI in the browser to verify that the connection is being served. You can also run the tests by 
jumping inside the container and running `npx mocha`, using the following command:

    docker exec -it 949cc5d81abe /bin/bash

Replacing the name with the name of the running image (discoverable via `docker ps`).

This Docker container does not come with a database attached, so the API can't do anything useful right off the bat. 
To make it do something useful you can mount the database you created as a volume using Docker controls, or rely on 
linkage tooling in a cluster manager like Kubernetes (which is what I did). Get this working is my next TODO in 
this project!

### To-do
* Migrate the name of the master table in the database from `Logbooks` to `Actions` (or something similarly 
communicative), and move from a SQLite to a Postgres DB.