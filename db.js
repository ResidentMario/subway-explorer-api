const Sequelize = require('sequelize');

function sequelize(fp, opts) {
    // Establish a connection to the database.
    return new Sequelize('database', 'username', 'password', {
        host: 'localhost',
        dialect: 'sqlite',
        pool: {
            max: 5,
            min: 0,
            acquire: 30000,
            idle: 10000
        },
        storage: fp,
        operatorsAliases: false,
        ...opts
    });

    // Authenticate the connection.
    // sequelize
    //   .authenticate()
    //   .then(() => {
    //     console.log('Connection has been established successfully.');
    //   })
    //   .catch(err => {
    //     console.error('Unable to connect to the database:', err);
    //   });

}


function Stops(sequelize) {
    return sequelize.define('Stops', {
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
}


function Logbooks(sequelize) {
    return sequelize.define('Logbooks', {
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
}


exports.sequelize = sequelize;
exports.Stops = Stops;
exports.Logbooks = Logbooks;