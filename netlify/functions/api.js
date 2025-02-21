const express = require('express');
const serverless = require('serverless-http');
const axios = require('axios');
const cors = require('cors');
const app = express();

app.use(express.json());

let accessToken = null;
let name = "";
let email = "";
let loggedIn = false;

const corsOptions = {
  origin: 'https://dog-matcher-todd-parsons.netlify.app',
  credentials: true
};

app.use(cors(corsOptions));

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://dog-matcher-todd-parsons.netlify.app',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

async function login() {
  try {
    const response = await axios.post(
      'https://frontend-take-home-service.fetch.com/auth/login',
      { name: name, email: email },
      { withCredentials: true }
    );
    
    const setCookieHeader = response.headers['set-cookie'];
    if (setCookieHeader && Array.isArray(setCookieHeader)) {
      const fetchAccessToken = setCookieHeader.find(cookie =>
        cookie.startsWith('fetch-access-token=')
      );
    
      if (fetchAccessToken) {
        accessToken = fetchAccessToken.split(';')[0];
        console.log(`Logged in. Got token: ${accessToken}`);
        loggedIn = true;
      } else {
        console.error('fetch-access-token cookie not found in response headers.');
      }
    } else {
      console.error('No Set-Cookie headers received in the response.');
    }
  } catch (error) {
    console.error('Login failed:', error.message);
  }
}

app.use(async (req, res, next) => {
  if (req.method === 'OPTIONS') {
    return res.status(204).set(corsHeaders).send();
  }

  if (!loggedIn) {
    if (req.url === '/auth/login') {
      name = req.body.name;
      email = req.body.email;
    }
    if (req.url !== '/auth/logout') {
      await login();
    }
  }

  const apiUrl = `https://frontend-take-home-service.fetch.com${req.path}`;
  console.log(`Intercepting ${req.path} and redirecting to ${req.method} ${apiUrl} (Body: ${JSON.stringify(req.body)})`);

  try {
    const apiResponse = await axios({
      method: req.method,
      url: apiUrl,
      headers: { Cookie: accessToken },
      params: req.query,
      data: req.body,
    });
    res.set(corsHeaders).status(apiResponse.status).json(apiResponse.data);
    console.log(`Server responded with ${apiResponse.status}`);
    if (req.url === '/auth/logout') {
      accessToken = null;
      name = '';
      email = '';
      loggedIn = false;
    }
  } catch (error) {
    if (error.response && error.response.status === 401) {
      await login();
      return next();
    } else if (error.response && error.response.status === 404) {
      console.log(`Got a 404 response on ${req.path}, with ${req.method}, using ${accessToken}`);
    }
    res.set(corsHeaders).status(error.response?.status || 500).json({
      error: error.message,
      details: error.response?.data
    });
    console.log(`Error status: ${JSON.stringify(error)}`);
  }
});

module.exports.handler = serverless(app);
