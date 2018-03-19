const express = require('express');
const app = express();
const moment = require('moment');
const api = require('./api.js');
const db = require('./db.js');
require('dotenv').config();
const DATABASE_FILEPATH = process.env.DATABASE_FILEPATH;

const sequelize = db.sequelize(DATABASE_FILEPATH);
const [Stops, Logbooks] = [db.Stops(sequelize), db.Logbooks(sequelize)];


function missing(text) { return JSON.stringify({status: "Error", message: `Missing ${text}.`}); }
function writeHead(res) {
    res.writeHead(200, {
        'Content-Type': 'text/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Request-Method': '*',
        'Access-Control-Allow-Methods': 'GET'
    });
}

// Example URI: http://localhost:3000/locate-stations/json?line=A&x=73.75&y=-73.75&heading=N&time=2018-01-18T12:00
app.get('/locate-stations/json',
    function(req, res) {
        writeHead(res);

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
            api.locateStation(req, sequelize, Stops).then(r => res.end(JSON.stringify(r)));
        }
});

// Example URI: http://localhost:3000/poll-travel-times/json?line=2&start=247N&end=220N&timestamps=2018-01-18T02:00
app.get('/poll-travel-times/json',
    function(req, res) {
        writeHead(res);

        // Query validation.
        if (!req.query.start) {
            res.status(400).end(missing('starting stop'));
        } else if (!req.query.end) {
            res.status(400).end(missing('ending stop'));
        } else if (!req.query.line) {
            res.status(400).end(missing('line'));
        } else if (!req.query.timestamps) {
            res.status(400).end(missing('timestamps'));
        } else {
            api.pollTravelTimes(req, sequelize, Logbooks).then(r => res.end(JSON.stringify(r)));
        }
});

app.get('/status', function(req, res) {
    writeHead(res);
    res.end(JSON.stringify({status: 'OK'}));
});

app.listen(3000);