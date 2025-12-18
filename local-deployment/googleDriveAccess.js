const { google } = require('googleapis');

async function getDriveFileAccess({ authClient, fileId }) {
  const drive = google.drive({ version: 'v3', auth: authClient });

  const resp = await drive.files.get({
    fileId,
    fields: 'id,name,capabilities(canEdit,canShare),ownedByMe,permissions(id,type,role)',
    supportsAllDrives: true,
  });

  const file = resp.data || {};
  const canEdit = Boolean(file.capabilities?.canEdit);
  const canShare = Boolean(file.capabilities?.canShare);

  return {
    id: file.id,
    name: file.name,
    canEdit,
    canShare,
    ownedByMe: Boolean(file.ownedByMe),
    permissions: Array.isArray(file.permissions) ? file.permissions : [],
  };
}

module.exports = {
  getDriveFileAccess,
};
