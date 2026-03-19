// Telegram Web Chat Exporter (HTML Format) - Incremental Sync Version
// This script is executed in the browser context after Saved Messages chat is opened
// It syncs HTML incrementally to prevent data loss if interrupted

async function exportTelegramChat() {
  console.log('Starting Telegram chat export with incremental sync...');

  // Find the scrollable message list container
  const messageList = document.querySelector('.MessageList');
  if (!messageList) {
    console.error('Message list not found');
    return {
      success: false,
      error: 'Message list not found'
    };
  }

  console.log('Found message list. Capturing current messages and loading more...');

  // Store all captured messages with their IDs to avoid duplicates
  const capturedMessages = new Map();

  // Store HTML header and footer separately
  let htmlHeader = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Telegram Chat Export</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background: #fff;
            color: #000;
        }
        .date-header {
            font-weight: bold;
            font-size: 14px;
            margin: 30px 0 15px 0;
            padding: 10px;
            background: #f0f0f0;
            text-align: center;
            border-radius: 8px;
        }
        .message {
            margin-bottom: 20px;
            padding: 10px;
            border-left: 3px solid #2481cc;
            background: #f9f9f9;
            page-break-inside: avoid;
        }
        .message.own {
            border-left-color: #4CAF50;
            background: #e8f5e9;
        }
        .message-header {
            font-weight: bold;
            color: #2481cc;
            margin-bottom: 8px;
            font-size: 12px;
        }
        .message.own .message-header {
            color: #4CAF50;
        }
        .message-text {
            margin-bottom: 10px;
            font-size: 14px;
            white-space: pre-wrap;
            word-wrap: break-word;
            line-height: 1.5;
        }
        .message-image {
            max-width: 100%;
            height: auto;
            margin: 10px 0;
            display: block;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .image-placeholder {
            margin: 10px 0;
            padding: 20px;
            background: #f0f0f0;
            font-size: 12px;
            color: #666;
            text-align: center;
            border-radius: 8px;
        }
        @media print {
            body {
                max-width: 100%;
            }
            .message {
                page-break-inside: avoid;
            }
        }
    </style>
</head>
<body>
    <h1>Telegram Chat Export</h1>
    <p id="message-count">Total messages: Loading...</p>
`;

  const htmlFooter = `
</body>
</html>`;

  // Global variable to store incremental HTML body content
  window.__incrementalExportBody = '';
  window.__exportMessageCount = 0;

  // Helper function to convert image to base64
  async function getImageBase64(imgElement) {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.crossOrigin = 'anonymous';

      return new Promise((resolve) => {
        img.onload = function () {
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);
          try {
            const dataURL = canvas.toDataURL('image/jpeg', 0.7);
            resolve(dataURL);
          } catch (e) {
            resolve(null);
          }
        };
        img.onerror = () => resolve(null);

        if (imgElement.src && imgElement.src.startsWith('blob:')) {
          img.src = imgElement.src;
        } else {
          resolve(null);
        }
      });
    } catch (e) {
      return null;
    }
  }

  // Helper function to process a single message to HTML
  async function processMessageToHtml(msg, dateHeader) {
    let html = '';

    // Add date header if provided
    if (dateHeader) {
      html += `    <div class="date-header">${dateHeader}</div>\n`;
    }

    // Extract text content
    const textContent = msg.querySelector('.text-content');
    let messageText = '';

    if (textContent) {
      const textClone = textContent.cloneNode(true);
      const metaElements = textClone.querySelectorAll('.MessageMeta');
      metaElements.forEach(el => el.remove());

      const brElements = textClone.querySelectorAll('br');
      brElements.forEach(br => {
        br.replaceWith(document.createTextNode('\n'));
      });

      const links = textClone.querySelectorAll('a');
      links.forEach(link => {
        const textNode = document.createTextNode(link.textContent);
        link.parentNode.replaceChild(textNode, link);
      });
      messageText = textClone.textContent.trim();
    }

    // Extract timestamp
    const timeEl = msg.querySelector('.message-time');
    const time = timeEl ? timeEl.textContent.trim() : '';

    // Determine if it's own message
    const isOwn = msg.classList.contains('own');

    // Start message div
    html += `    <div class="message${isOwn ? ' own' : ''}">\n`;
    html += `        <div class="message-header">${isOwn ? 'You' : 'Contact'} ${time ? `[${time}]` : ''}</div>\n`;

    // Add message text
    if (messageText) {
      const escapedText = messageText
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
      html += `        <div class="message-text">${escapedText}</div>\n`;
    }

    // Extract and add images
    const images = msg.querySelectorAll('img.full-media');
    for (const img of images) {
      if (img.classList.contains('ReactionStaticEmoji') || img.width < 50 || img.height < 50) {
        continue;
      }

      const base64 = await getImageBase64(img);

      if (base64) {
        html += `        <img src="${base64}" class="message-image" alt="Message image">\n`;
      } else {
        html += `        <div class="image-placeholder">[Image]</div>\n`;
      }
    }

    html += `    </div>\n`;

    return html;
  }

  // Helper function to capture currently visible messages and convert to HTML
  async function captureAndProcessNewMessages() {
    const messages = messageList.querySelectorAll('.Message');
    let newCount = 0;
    const newMessagesHtml = [];

    // Capture date groups for context
    const dateGroups = new Map();
    messageList.querySelectorAll('.message-date-group').forEach(group => {
      const dateEl = group.querySelector('.sticky-date span');
      const dateText = dateEl ? dateEl.textContent.trim() : null;

      if (dateText) {
        const messagesInGroup = group.querySelectorAll('.Message');
        messagesInGroup.forEach(msg => {
          const msgId = msg.getAttribute('data-message-id');
          if (msgId) {
            dateGroups.set(msgId, dateText);
          }
        });
      }
    });

    for (const msg of messages) {
      const msgId = msg.getAttribute('data-message-id');
      if (msgId && !capturedMessages.has(msgId)) {
        capturedMessages.set(msgId, msg.cloneNode(true));

        // Get date for this message
        let dateHeader = dateGroups.get(msgId);
        if (!dateHeader) {
          const timestamp = msg.getAttribute('data-timestamp');
          if (timestamp) {
            const date = new Date(parseInt(timestamp) * 1000);
            dateHeader = date.toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            });
          }
        }

        // Process message to HTML immediately
        const messageHtml = await processMessageToHtml(msg, null); // Don't add date header yet
        newMessagesHtml.push({
          id: msgId,
          html: messageHtml,
          date: dateHeader || 'Unknown Date',
          timestamp: msg.getAttribute('data-timestamp') || '0'
        });

        newCount++;
      }
    }

    // Add new messages to incremental body
    if (newMessagesHtml.length > 0) {
      // Sort by timestamp
      newMessagesHtml.sort((a, b) => parseInt(a.timestamp) - parseInt(b.timestamp));

      // Group by date and prepend to body (since we're scrolling backwards)
      let currentDate = null;
      let chunk = '';

      for (const msgData of newMessagesHtml) {
        if (msgData.date !== currentDate) {
          chunk += `    <div class="date-header">${msgData.date}</div>\n`;
          currentDate = msgData.date;
        }
        chunk += msgData.html;
      }

      // Prepend to body (we're loading older messages)
      window.__incrementalExportBody = chunk + window.__incrementalExportBody;
      window.__exportMessageCount = capturedMessages.size;

      // Signal that we have a new update (Selenium can poll this)
      window.__exportUpdated = true;
      window.__exportLastUpdate = Date.now();
    }

    return newCount;
  }

  // Initialize export progress tracking
  window.__exportUpdated = false;
  window.__exportLastUpdate = Date.now();

  // Step 1: Capture and process current messages first
  let initialCount = await captureAndProcessNewMessages();
  console.log(`Captured and processed ${initialCount} initial messages`);
  console.log(`✅ Incremental sync ready - ${window.__exportMessageCount} messages in buffer`);

  // Step 2: Scroll up to load older messages WITH INCREMENTAL SYNCING
  let noChangeCount = 0;
  const maxNoChangeAttempts = 20;
  let scrollAttempts = 0;

  console.log('Now scrolling to load older messages with incremental sync...');

  // Helper: scroll to top and wait for Telegram to load the older message chunk
  async function scrollToTopAndWait() {
    messageList.scrollTop = 0;
    await new Promise(resolve => setTimeout(resolve, 300));
    messageList.scrollTop = 0;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Helper: scroll down a bit so Telegram "sees" we moved away from the top,
  // then scroll back up — this forces the virtual list to re-anchor and load
  // a fresh older chunk rather than staying frozen at the same boundary.
  async function nudgeAndReload() {
    // Scroll down slightly to break the "stuck at top" state
    messageList.scrollBy(0, 300);
    await new Promise(resolve => setTimeout(resolve, 400));
    // Scroll back up to trigger loading of older messages
    messageList.scrollTop = 0;
    await new Promise(resolve => setTimeout(resolve, 1200));
  }

  while (noChangeCount < maxNoChangeAttempts) {
    scrollAttempts++;
    const beforeCount = capturedMessages.size;

    // Primary scroll: go all the way to top
    await scrollToTopAndWait();

    // Capture whatever is visible after the first scroll
    let newMessages = await captureAndProcessNewMessages();
    let afterCount = capturedMessages.size;

    // If no new messages appeared, use the up→down→up nudge to unstick the
    // virtual scroll and force Telegram to render the next older batch
    if (afterCount === beforeCount) {
      await nudgeAndReload();
      newMessages = await captureAndProcessNewMessages();
      afterCount = capturedMessages.size;
    }

    if (afterCount === beforeCount) {
      noChangeCount++;
      console.log(`[Attempt ${scrollAttempts}] No new messages (${noChangeCount}/${maxNoChangeAttempts}). Total: ${afterCount}`);
    } else {
      noChangeCount = 0;
      console.log(`[Attempt ${scrollAttempts}] +${afterCount - beforeCount} messages! Total: ${afterCount}`);
      console.log(`✅ Incremental buffer updated - Ready for sync`);
    }
  }

  console.log(`Finished loading. Total unique messages captured: ${capturedMessages.size}`);
  console.log('Finalizing HTML export...');

  // Assemble final HTML from incremental buffer
  // Update header with final count
  const finalHeader = htmlHeader.replace('Total messages: Loading...', `Total messages: ${window.__exportMessageCount}`);
  const htmlContent = finalHeader + window.__incrementalExportBody + htmlFooter;

  console.log(`✅ Final HTML assembled: ${htmlContent.length} characters, ${window.__exportMessageCount} messages`);

  return {
    success: true,
    html: htmlContent,
    messageCount: capturedMessages.size
  };
}

// Export the function for execution - return the promise so it can be awaited
return exportTelegramChat();