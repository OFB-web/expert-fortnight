const express = require('express');
require('express-async-errors');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const routes = require('./routes');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./middleware/logger');

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: "*"
  })
);
app.use(express.json());
app.use(logger);
app.use(morgan('dev'));

app.use('/api/v1', routes);

app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the Blood Bank API' });
});

app.use(notFound);
app.use(errorHandler);

module.exports = app;
