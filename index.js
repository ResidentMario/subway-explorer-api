// URI: http://localhost:3000/locate-stations/json?line=2&x=10&y=40&name=%22The%20Road%22&time=2018-01-18T12:00

const express = require('express');
const app = express();
const Sequelize = require('sequelize');
const Op = Sequelize.Op;
const moment = require('moment');

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

  // SQLite only
  storage: './scripts/logbooks.sqlite',  // TODO: Move the DB to a production location.

  // http://docs.sequelizejs.com/manual/tutorial/querying.html#operators
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
const Stop = sequelize.define('Stops', {
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

/*
   I need to define another middleware script for writing GTFS stations.txt records to the database so that it can
   queried using this function.
*/
app.get('/locate-stations/json',
    function(req, res) {
        // console.log(req.query);
        res.setHeader('Content-Type', 'application/json');

        // Query validation.
        if (!req.query.line) {
            res.status(400).send({
                status: "Error",
                message: "No line parameter was provided."
            });
        }

        else if (!req.query.time) {
            res.status(400).send({
                status: "Error",
                message: "No time parameter was provided."
            });
        }

        else if (!req.query.name || (!req.query.x && !req.query.y)) {
            console.log(~req.query.name);
            res.status(400).send({
                status: "Error",
                message: "Neither the station coordinates nor the station name was provided. At least one is required."
            });
        }

        // Validation passed, now let's do stuff.
        else {
            // req.query.time = moment(req.query.time);
            const unix_ts = moment(req.query.time).unix();

            if (req.query.name) {
                Stop.findAll({
                    where: {
                        authority_start_time: {[Op.lt]: [unix_ts]},
                        authority_end_time: {[Op.gt]: [unix_ts]},
                        stop_name: {[Op.eq]: [req.query.name]}
                    }
                }).then(
                    resultSet => {
                        if (resultSet.length > 0) {
                            res.send(resultSet[0]);
                        } else {
                            // Finding the stop using an exact name match failed. Now we need to geolocate.
                            // TODO: Implement this match!
                            Stops.findOne({
                                where: {
                                    authority_start_time: {[Op.lt]: [unix_ts]},
                                    authority_end_time: {[Op.gt]: [unix_ts]}
                                }
                            }).then(
                            )
                        }
                    }
                );

            }

        }
});

app.listen(3000);