const express = require('express');
const serverless = require('serverless-http');
const axios = require('axios');
const cors = require('cors');
const app = express();

app.use(express.json());

let accessToken = null;
let name="";
let email="";
let loggedIn=false;

app.use(cors());
app.use(cors({ origin: '*', credentials: true }));
// app.use(cors({ origin: 'https://dog-matcher-todd-parsons.netlify.app', credentials: true }));
// app.options('*', cors({ origin: 'https://dog-matcher-todd-parsons.netlify.app', credentials: true }));

// Function to login and fetch the cookie
async function login() {
  try {
    const response = await axios.post(
      'https://frontend-take-home-service.fetch.com/auth/login',
      { name: name, email: email },
      { withCredentials: true }
    );
    
    const setCookieHeader = response.headers['set-cookie'];
    if (setCookieHeader && Array.isArray(setCookieHeader)) {
      // Find the cookie that matches "fetch-access-token"
      const fetchAccessToken = setCookieHeader.find(cookie =>
        cookie.startsWith('fetch-access-token=')
      );
    
      if (fetchAccessToken) {
        // Extract only the value of the fetch-access-token cookie
        accessToken = fetchAccessToken.split(';')[0]; // e.g., "fetch-access-token=..."
	      console.log(`Logged in. Got token: ${accessToken}`);
        loggedIn=true;
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

// Middleware to handle API requests
app.use(async (req, res, next) => {
  if (!loggedIn) {
    if (req.url==='/auth/login') {
      name=req.body.name;
      email=req.body.email;
    }
    if (req.url !== '/auth/logout') {
      await login();
    }
  }

  const apiUrl = `https://frontend-take-home-service.fetch.com${req.path}`;
  console.log(`Intercepting ${req.path} and redirecting to ${req.method} ${apiUrl} (Body: ${JSON.stringify(req.body)})`);
  const headers = {
    'Access-Control-Allow-Origin': 'https://dog-matcher-todd-parsons.netlify.app',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };
  
  // Handle OPTIONS requests for preflight
  if (req.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: headers
    };
  }
  
  try {
    const apiResponse = await axios({
      method: req.method,
      url: apiUrl,
      headers: { Cookie: accessToken },
      params: req.query,
      data: req.body,
    });
    res.set(headers).status(apiResponse.status).json(apiResponse.data);
    console.log(`Server responded with ${apiResponse.status}`);
    if (req.url==='/auth/logout') {
      accessToken=null;
      name='';
      email='';
      loggedIn=false;
    }
  } catch (error) {
    if (error.response && error.response.status === 401) {
      // Re-login on 401 error
      await login();
      return next(); // Retry the request
    } else if (error.response && error.response.status === 404) {
      console.log(`Got a 404 response on ${req.path}, with ${req.method}, using ${accessToken}`);
    }
    res.status(error.response?.status || 500).send(error);
	  console.log(`Error status:${JSON.stringify(error)}`);
  }
});

app.use((req, res) => {
  res.status(404).send(`${req.path} not found.`);
});

module.exports.handler = serverless(app);