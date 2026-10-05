function doGet(e) {
  // kept for reads (the HTML still uses GET to read via API key — this is just a safety shim)
  return ContentService.createTextOutput('ok');
}

function doPost(e) {
  var ss = SpreadsheetApp.openById('1rfTvbs8S5sdeAcVjihK9jcLn-YXezamPiOVzQy15dvk');
  
  // Write debug info to a debug tab
  var debug = ss.getSheetByName('debug') || ss.insertSheet('debug');
  
  try {
    var payload = JSON.parse(e.postData.contents);

    // Photo upload/delete (Google Drive) — separate from the sheet writes below
    if (payload.action) {
      return ContentService
        .createTextOutput(JSON.stringify(handlePhoto_(payload)))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var sheetName = payload.sheet;
    var data = payload.data;
    
    debug.appendRow([new Date(), 'payload received', sheetName, JSON.stringify(data).substring(0, 200)]);
    
    var sheet = ss.getSheetByName(sheetName);
    debug.appendRow([new Date(), 'sheet found', sheet ? 'YES' : 'NO — will create']);
    
    if (!sheet) sheet = ss.insertSheet(sheetName);
    sheet.clearContents();

    if (data.type === 'kv') {
      Object.entries(data.map).forEach(function(pair) {
        sheet.appendRow(pair);
      });
    } else if (data.type === 'json') {
      sheet.getRange('A1').setValue(data.value);
    }

    debug.appendRow([new Date(), 'write complete']);

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    debug.appendRow([new Date(), 'ERROR', err.toString()]);
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function handlePhoto_(p) {
  var NAME = 'Trip Planner Photos';
  var it = DriveApp.getFoldersByName(NAME);
  var folder = it.hasNext() ? it.next() : DriveApp.createFolder(NAME);
  try {
    if (p.action === 'upload') {
      var blob = Utilities.newBlob(Utilities.base64Decode(p.data), p.mime || 'image/jpeg', p.name || 'photo.jpg');
      var file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return { ok: true, id: file.getId() };
    }
    if (p.action === 'delete') {
      var f = DriveApp.getFileById(p.id);
      // Only ever trash files that live in the photos folder
      var parents = f.getParents();
      while (parents.hasNext()) {
        if (parents.next().getId() === folder.getId()) { f.setTrashed(true); break; }
      }
      return { ok: true };
    }
    return { ok: false, error: 'unknown action' };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// Run this once from the editor to grant Drive access, then deploy a new version.
function authorizeDrive() {
  // Touches the same Drive calls the uploader uses so the full Drive scope is granted
  DriveApp.createFolder('authorize-test').setTrashed(true);
}
