// URI: http://localhost:3000/locate-stations/json?line=2&x=10&y=40&name=%22The%20Road%22&time=2018-01-18T12:00
const express = require('express');
const app = express();
const Sequelize = require('sequelize');
const Op = Sequelize.Op;
const moment = require('moment');
const api = require('./api.js');

// Establish a connection to the database.
const sequelize = new Sequelize('database', 'username', 'password', {
    host: 'localhost',
    dialect: 'sqlite',
    pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
    },
    // TODO: Move the DB to a production location.
    storage: './scripts/logbooks.sqlite',
    operatorsAliases: false
});

// Authenticate the connection.
sequelize
  .authenticate()
  .then(() => {
    console.log('Connection has been established successfully.');
  })
  .catch(err => {
    console.error('Unable to connect to the database:', err);
  });

// Define a stops model.
const Stops = sequelize.define('Stops', {
    authority_id: {type: Sequelize.INTEGER, primaryKey: true},
    stop_id: {type: Sequelize.STRING},
    stop_name: {type: Sequelize.STRING},
    stop_lat: {type: Sequelize.REAL},
    stop_lon: {type: Sequelize.REAL},
    authority_start_time: {type: Sequelize.REAL},
    authority_end_time: {type: Sequelize.REAL}
}, {
    timestamps: false
});

const Logbooks = sequelize.define('Logbooks', {
    event_id: {type: Sequelize.INTEGER, primaryKey: true},
    trip_id: {type: Sequelize.STRING},
    unique_trip_id: {type: Sequelize.STRING},
    route_id: {type: Sequelize.STRING},
    action: {type: Sequelize.STRING},
    minimum_time: {type: Sequelize.REAL},
    maximum_time: {type: Sequelize.REAL},
    stop_id: {type: Sequelize.STRING},
    latest_information_time: {type: Sequelize.REAL}
}, {
    timestamps: false
});

app.get('/locate-stations/json',
    function(req, res) {
        res.setHeader('Content-Type', 'application/json');

        // Query validation.
        if (!req.query.line) {
            res.status(400).send({status: "Error", message: "No line parameter provided."})
        } else if (!req.query.time) {
            res.status(400).send({status: "Error", message: "No time parameter provided."})
        } else if (!req.query.name && (!req.query.x && !req.query.y)) {
            res.status(400).send({status: "Error", message: "Neither station coordinates nor station name provided."})
        } else {
            api.locateStation(req, Stops, sequelize).then(r => res.send(r));
        }
});

app.get('/poll-travel-times/json',
    function(req, res) {
        res.setHeader('Content-Type', 'application/json');

        function missing(text) { return {status: "Error", message: `Missing ${text}.`}; }

        // Query validation.
        if (!req.query.start) {
            res.status(400).send(missing('starting stop'));
        } else if (!req.query.end) {
            res.status(400).send(missing('ending stop'));
        } else if (!req.query.line) {
            res.status(400).send(missing('line'));
        } else if (!req.query.timestamps) {
            res.status(400).send(missing('timestamps'));
        } else {
            api.pollTravelTimes(req, sequelize, Logbooks).then(r => res.send(r));
        }
});

app.listen(3000);