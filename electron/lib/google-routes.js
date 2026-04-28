'use strict';
const googleApi = require('./google-api');

module.exports = async function handleGoogleRoute(urlPath, params, req, res, jsonResp) {
  try {
    if (urlPath === '/status') {
      return jsonResp(res, 200, googleApi.authStatus());
    }
    if (urlPath === '/calendar/events') {
      const r = await googleApi.listEvents(params.from, params.to);
      return jsonResp(res, 200, r);
    }
    if (urlPath === '/calendar/create') {
      if (!params.summary || !params.start || !params.end) return jsonResp(res, 400, { error: 'summary, start, end required' });
      const r = await googleApi.createEvent(params.summary, params.start, params.end, params.attendees);
      return jsonResp(res, 200, r);
    }
    if (urlPath === '/calendar/delete') {
      if (!params.eventId) return jsonResp(res, 400, { error: 'eventId required' });
      const r = await googleApi.deleteEvent(params.eventId);
      return jsonResp(res, 200, r);
    }
    if (urlPath === '/calendar/freebusy') {
      const r = await googleApi.getFreeBusy(params.from, params.to);
      return jsonResp(res, 200, r);
    }
    if (urlPath === '/calendar/free-slots') {
      const r = await googleApi.getFreeSlots(params.date, params.workStart, params.workEnd, params.slotMinutes);
      return jsonResp(res, 200, r);
    }
    // Gmail
    if (urlPath === '/gmail/inbox') {
      const r = await googleApi.listInbox(params.max);
      return jsonResp(res, 200, r);
    }
    if (urlPath === '/gmail/read') {
      if (!params.id) return jsonResp(res, 400, { error: 'id required' });
      const r = await googleApi.readEmail(params.id);
      return jsonResp(res, 200, r);
    }
    if (urlPath === '/gmail/send' || urlPath === '/gmail/reply') {
      const sourceChannel = req.headers['x-source-channel'] || '';
      if (sourceChannel.toLowerCase() === 'zalo') {
        return jsonResp(res, 403, { error: 'Gmail send not allowed from Zalo channel' });
      }
    }
    if (urlPath === '/gmail/send') {
      if (!params.to || !params.subject || !params.body) return jsonResp(res, 400, { error: 'to, subject, body required' });
      const r = await googleApi.sendEmail(params.to, params.subject, params.body);
      return jsonResp(res, 200, r);
    }
    if (urlPath === '/gmail/reply') {
      if (!params.id || !params.body) return jsonResp(res, 400, { error: 'id, body required' });
      const r = await googleApi.replyEmail(params.id, params.body);
      return jsonResp(res, 200, r);
    }
    // Drive
    if (urlPath === '/drive/list') {
      const r = await googleApi.listFiles(params.query, params.max);
      return jsonResp(res, 200, r);
    }
    if (urlPath === '/drive/upload') {
      if (!params.filePath) return jsonResp(res, 400, { error: 'filePath required' });
      const r = await googleApi.uploadFile(params.filePath, params.folderId);
      return jsonResp(res, 200, r);
    }
    if (urlPath === '/drive/download') {
      if (!params.fileId || !params.destPath) return jsonResp(res, 400, { error: 'fileId and destPath required' });
      const r = await googleApi.downloadFile(params.fileId, params.destPath);
      return jsonResp(res, 200, r);
    }
    if (urlPath === '/drive/share') {
      if (!params.fileId || !params.email) return jsonResp(res, 400, { error: 'fileId and email required' });
      const r = await googleApi.shareFile(params.fileId, params.email, params.role);
      return jsonResp(res, 200, r);
    }
    // Contacts
    if (urlPath === '/contacts/list' || urlPath === '/contacts/search') {
      const r = await googleApi.listContacts(params.query);
      return jsonResp(res, 200, r);
    }
    if (urlPath === '/contacts/create') {
      if (!params.name) return jsonResp(res, 400, { error: 'name required' });
      const r = await googleApi.createContact(params.name, params.phone, params.email);
      return jsonResp(res, 200, r);
    }
    // Tasks
    if (urlPath === '/tasks/list') {
      const r = await googleApi.listTasks(params.listId);
      return jsonResp(res, 200, r);
    }
    if (urlPath === '/tasks/create') {
      if (!params.title) return jsonResp(res, 400, { error: 'title required' });
      const r = await googleApi.createTask(params.title, params.due, params.listId);
      return jsonResp(res, 200, r);
    }
    if (urlPath === '/tasks/complete') {
      if (!params.taskId) return jsonResp(res, 400, { error: 'taskId required' });
      const r = await googleApi.completeTask(params.taskId);
      return jsonResp(res, 200, r);
    }
    return jsonResp(res, 404, { error: 'unknown google route: ' + urlPath });
  } catch (e) {
    return jsonResp(res, 500, { error: e.message });
  }
};
