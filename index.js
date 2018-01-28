const express = require('express');
const app = express();
const moment = require('moment');
const api = require('./api.js');
const db = require('./db.js');


const sequelize = db.sequelize();
const [Stops, Logbooks] = [db.Stops(sequelize), db.Logbooks(sequelize)];


function missing(text) { return {status: "Error", message: `Missing ${text}.`}; }

// Example URI: http://localhost:3000/locate-stations/json?line=2&x=73.75&y=-73.75&time=2018-01-18T12:00
app.get('/locate-stations/json',
    function(req, res) {
        res.setHeader('Content-Type', 'application/json');

        // Query validation.
        if (!req.query.line) {
            res.status(400).send(missing('line'));
        } else if (!req.query.time) {
            res.status(400).send(missing('time'));
        } else if (!req.query.x && !req.query.y) {
            res.status(400).send(missing('coordinates'));
        }  else if (!req.query.heading) {
            res.status(400).send(missing('heading'));
        } else {
            api.locateStation(req, sequelize, Stops).then(r => res.send(r));
        }
});

// Example URI: http://localhost:3000/poll-travel-times/json?line=2&start=201N&end=235N&timestamps=2018-01-18T09:53
app.get('/poll-travel-times/json',
    function(req, res) {
        res.setHeader('Content-Type', 'application/json');

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