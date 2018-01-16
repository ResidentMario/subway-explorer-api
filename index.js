const express = require('express');
const app = express();

app.get('/locate-stations/json',
    function(req, res) {
        if (req.query.line === null || req.query.line === undefined) {
            res.status(400).send({
                status: "Error",
                message: "No line parameter was provided."
            });
        }
        else if ((req.query.coords === null || req.query.coords === undefined) &&
                 (req.query.name === null || req.query.name === undefined)) {
            res.status(400).send({
                status: "Error",
                message: "Neither the station coordinates nor the station name was provided. At least one is required."
            });
        }
        else {
            let coords = req.query.coords;
            let name = req.query.name;
            let time = req.query.time;
            let line = req.query.line;
            console.log(req.query);
            res.send('Hello World!')
        }
});

app.listen(3000);