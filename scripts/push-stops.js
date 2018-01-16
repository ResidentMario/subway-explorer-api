/* A command-line script for pushing stops to the database. Currently on hold. */

const fs = require('fs');
const Sequelize = require('sequelize');
let program = require('commander');

program
    .version('0.1.0')
    .option('-p, --path <required>', 'Path to your stops.txt file.')
    .option('-s, --start <required>',
        'GTFS records are only valid for certain blocks of time.' +
        'Provide the start time for the relevance of the given GTFS stops.txt record here. UNIX timestamp expected.',
        parseFloat)
    .option('-e, --end <required>',
        'GTFS records are only valid for certain blocks of time. ' +
        'Provide the end time for the relevance of the given GTFS stops.txt record here. UNIX timestamp expected.',
        parseFloat)
    .parse(process.argv);

program.path();

console.log(program);


// const sequelize = new Sequelize('database', 'username', 'password', {
//     host: 'localhost',
//     dialect: 'mysql'|'sqlite'|'postgres'|'mssql',
//
//     pool: {
//         max: 5,
//         min: 0,
//         acquire: 30000,
//         idle: 10000
//     },
//
//     // SQLite only
//     storage: 'path/to/database.sqlite'
// });