/**
 * @OnlyCurrentDoc
 *
 * The above comment directs App Script to limit the scope of execution
 * to only the current document.
 */

/**
 * Creates a custom menu in the Google Doc UI when the document is opened.
 * This is a simple trigger that runs automatically.
 *
 * @param {object} e The event parameter for a simple trigger.
 */
function onOpen(e) {
  DocumentApp.getUi()
    .createMenu('Markdown Tools')
    .addItem('Apply Markdown Formatting', 'applyMarkdownFormatting')
    .addToUi();
}

/**
 * Main function to find and replace Markdown syntax with Google Docs formatting.
 */
function applyMarkdownFormatting() {
  Logger.log('Starting Markdown formatting process.');
  const doc = DocumentApp.getActiveDocument();
  const body = doc.getBody();
  const userProperties = PropertiesService.getUserProperties();

  // --- CONTEXT AWARENESS FIX ---
  // Check if this is a continuation run *before* we do anything else.
  // If resumeFrom is > 0, we know this run was started by a trigger.
  const resumeFrom = parseInt(userProperties.getProperty('MARKDOWN_CONVERT_PROGRESS') || '0');
  const isContinuationRun = resumeFrom > 0;
  // --- END FIX ---

  // Clean up any old triggers from previous runs to prevent duplicates.
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === 'applyMarkdownFormatting') {
      ScriptApp.deleteTrigger(trigger);
      Logger.log(`Deleted an existing trigger: ${trigger.getUniqueId()}`);
    }
  }

  const startTime = new Date().getTime();
  const timeLimit = 270000; // 4.5 minutes

  const numElements = body.getNumChildren();
  Logger.log(`Found ${numElements} total elements. isContinuationRun: ${isContinuationRun}. Resuming from index ${resumeFrom}.`);

  for (let i = resumeFrom; i < numElements; i++) {
    const element = body.getChild(i);

    if (element.getType() == DocumentApp.ElementType.PARAGRAPH) {
      const para = element.asParagraph();
      if (para.getText().trim() === "") continue;
      
      Logger.log(`Processing paragraph ${i}: "${para.getText().substring(0, 80)}..."`);
      
      const resetStyle = {
        [DocumentApp.Attribute.BOLD]: false,
        [DocumentApp.Attribute.ITALIC]: false,
        [DocumentApp.Attribute.STRIKETHROUGH]: false,
        [DocumentApp.Attribute.BACKGROUND_COLOR]: null,
        [DocumentApp.Attribute.FONT_FAMILY]: 'Arial'
      };
      
      if (para.getParent().getType() !== DocumentApp.ElementType.LIST_ITEM && para.getText().length > 0) {
        para.editAsText().setAttributes(0, para.getText().length - 1, resetStyle);
      }
      
      if (formatHeadings(para)) continue;

      let textElementForInlineStyles = para.editAsText();
      const newListItem = formatUnorderedList(para);
      if (newListItem) {
        textElementForInlineStyles = newListItem.editAsText();
      }
      formatInlineStyles(textElementForInlineStyles);
    }

    const elapsedTime = new Date().getTime() - startTime;
    if (elapsedTime > timeLimit) {
      userProperties.setProperty('MARKDOWN_CONVERT_PROGRESS', (i + 1).toString());
      ScriptApp.newTrigger('applyMarkdownFormatting').timeBased().after(10 * 1000).create();
      Logger.log(`Execution time limit reached. Pausing. Will resume at index ${i + 1}.`);
      
      // This alert is safe because the *first* run is always user-initiated.
      DocumentApp.getUi().alert(`Formatting is in progress... This may take some time for large documents. The script will continue in the background. (Processed ${i + 1}/${numElements})`);
      return;
    }
  }

  // If the loop completes, all paragraphs have been processed.
  userProperties.deleteProperty('MARKDOWN_CONVERT_PROGRESS');
  Logger.log('Successfully applied Markdown formatting to the entire document.');
  
  // --- CONTEXT AWARENESS FIX ---
  // Only show a UI alert if the script finished in the initial, user-driven run.
  // Otherwise, send an email, which works from any context (including triggers).
  if (isContinuationRun) {
    const userEmail = Session.getActiveUser().getEmail();
    const docName = doc.getName();
    MailApp.sendEmail(
      userEmail,
      `Formatting Complete: ${docName}`,
      `The Markdown formatting script has successfully finished running on your document, "${docName}".`
    );
    Logger.log(`Sent completion email to ${userEmail}.`);
  } else {
    DocumentApp.getUi().alert('Markdown formatting has been applied successfully!');
  }
  // --- END FIX ---
}

/**
 * Checks for and applies heading formatting (H1-H4).
 */
function formatHeadings(para) {
  const text = para.getText().trim();
  const headingLevels = [
    { prefix: '####', style: DocumentApp.ParagraphHeading.HEADING4, name: 'H4' },
    { prefix: '###', style: DocumentApp.ParagraphHeading.HEADING3, name: 'H3' },
    { prefix: '##', style: DocumentApp.ParagraphHeading.HEADING2, name: 'H2' },
    { prefix: '#', style: DocumentApp.ParagraphHeading.HEADING1, name: 'H1' },
  ];

  for (const level of headingLevels) {
    if (text.startsWith(level.prefix + ' ')) {
      para.setHeading(level.style);
      para.setText(text.substring(level.prefix.length + 1));
      return true;
    }
  }
  return false;
}

/**
 * Checks for markdown list syntax. If found, replaces the paragraph with a new list item element.
 * @return {GoogleAppsScript.Document.ListItem | null} The new ListItem element if created, otherwise null.
 */
function formatUnorderedList(para) {
    const text = para.getText();
    const listItemRegex = /^\s*([*\-+])\s+/;
    const match = text.match(listItemRegex);

    if (match) {
        if (text.trim().startsWith('**') || text.trim().startsWith('__')) return null;
        
        const body = para.getParent();
        if (body && typeof body.getChildIndex === 'function') {
            const index = body.getChildIndex(para);
            const contentText = text.substring(match[0].length);
            para.removeFromParent();
            return body.insertListItem(index, contentText);
        }
    }
    return null;
}

/**
 * Applies various inline styles like bold, italic, strikethrough, and code.
 */
function formatInlineStyles(textElement) {
    replaceAndStyle(textElement, /(~~)(.+?)\1/g, { [DocumentApp.Attribute.STRIKETHROUGH]: true }, 'Strikethrough');
    replaceAndStyle(textElement, /(`)(.+?)\1/g, { [DocumentApp.Attribute.FONT_FAMILY]: 'Consolas', [DocumentApp.Attribute.BACKGROUND_COLOR]: '#f3f3f3' }, 'Code');
    replaceAndStyle(textElement, /(\*\*|__)(.+?)\1/g, { [DocumentApp.Attribute.BOLD]: true }, 'Bold');
    replaceAndStyle(textElement, /(\*)([^*]+?)\1/g, { [DocumentApp.Attribute.ITALIC]: true }, 'Italic (*)');
    replaceAndStyle(textElement, /(_)([^_]+?)\1/g, { [DocumentApp.Attribute.ITALIC]: true }, 'Italic (_)');
}

/**
 * Helper function to find all regex matches, then loop backwards to replace text and apply styling.
 */
function replaceAndStyle(textElement, regex, style, styleName) {
    const text = textElement.getText();
    if (!text) return;

    const matches = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
        matches.push({ full: match[0], content: match[2], start: match.index });
    }

    if (matches.length === 0) return;

    for (let i = matches.length - 1; i >= 0; i--) {
        const currentMatch = matches[i];
        textElement.deleteText(currentMatch.start, currentMatch.start + currentMatch.full.length - 1);
        textElement.insertText(currentMatch.start, currentMatch.content);
        const end = currentMatch.start + currentMatch.content.length - 1;
        if (currentMatch.start <= end) {
          textElement.setAttributes(currentMatch.start, end, style);
        }
    }
}
/**
 * Logs the current script's execution context, useful for debugging.
 */ 