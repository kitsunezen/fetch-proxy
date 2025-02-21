const express = require('express');
const serverless = require('serverless-http');
const axios = require('axios');
const cors = require('cors');
const app = express();
const router = express.Router();

router.get("/", (req, res) => {
	res.send("Proxy is running..");
});
app.use("/.netlify/functions/app", router);
module.exports.handler = serverless(app);
app.use(express.json());

let accessToken = null;
let name="";
let email="";
let loggedIn=false;

app.use(cors({ origin: 'https://localhost:5173', credentials: true }));
app.options('*', cors({ origin: 'https://localhost:5173', credentials: true }));

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
  try {
    const apiResponse = await axios({
      method: req.method,
      url: apiUrl,
      headers: { Cookie: accessToken },
      params: req.query,
      data: req.body,
    });
    res.status(apiResponse.status).json(apiResponse.data);
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

// Start the server
app.listen(3000, () => console.log('Proxy server running on http://localhost:3000'));
