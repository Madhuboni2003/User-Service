const dotenv = require('dotenv');

dotenv.config();

const config = {
    development: {
        username: process.env.DEV_DB_USER || 'root',
        password: process.env.DEV_DB_PASSWORD || '1748arijiT#',
        database: process.env.DEV_DB_NAME || 'workrdb',
        host: process.env.DEV_DB_HOST || 'localhost',
        dialect: 'mysql',
        port: process.env.DEV_DB_PORT || 3306
    },
    // test: {
    //     username: process.env.DB_USER || 'root',
    //     password: process.env.DB_PASSWORD || '',
    //     database: process.env.DB_NAME_TEST || 'user_service_test',
    //     host: process.env.DB_HOST || 'localhost',
    //     dialect: 'mysql',
    //     port: process.env.DB_PORT || 3306
    // },
    production: {
        username: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        host: process.env.DB_HOST,
        dialect: 'mysql',
        port: process.env.DB_PORT || 3306
    }
};

module.exports = config;