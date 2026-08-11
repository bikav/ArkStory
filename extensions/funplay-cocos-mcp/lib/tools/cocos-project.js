'use strict';

function hasEditorMessage() {
  return Boolean(global.Editor && Editor.Message);
}

function ensureEditorMessage() {
  if (!hasEditorMessage()) {
    throw new Error('Editor.Message is unavailable in this Cocos extension host.');
  }
}

async function requestEditorMessage(channel, method, ...args) {
  ensureEditorMessage();
  if (typeof Editor.Message.request !== 'function') {
    throw new Error('Editor.Message.request is unavailable in this Cocos extension host.');
  }
  return await Editor.Message.request(channel, method, ...args);
}

async function tryEditorRequests(candidates) {
  const attempts = [];
  for (const candidate of candidates) {
    const channel = candidate.channel;
    const method = candidate.method;
    const args = Array.isArray(candidate.args) ? candidate.args : [];
    try {
      const result = await requestEditorMessage(channel, method, ...args);
      return {
        ok: true,
        channel,
        method,
        result,
        attempts,
      };
    } catch (error) {
      attempts.push({ channel, method, error: error.message });
    }
  }

  const message = attempts.length
    ? attempts.map((attempt) => `${attempt.channel}.${attempt.method}: ${attempt.error}`).join('; ')
    : 'no editor message candidates were provided';
  const error = new Error(`No compatible Cocos editor message succeeded: ${message}`);
  error.attempts = attempts;
  throw error;
}

async function tryEditorRequestsStatus(candidates) {
  try {
    return await tryEditorRequests(candidates);
  } catch (error) {
    return {
      ok: false,
      available: false,
      attempts: error.attempts || [],
      error: error.message,
    };
  }
}

async function openPanel(panelName) {
  const id = String(panelName || 'builder').trim();
  if (!id) {
    throw new Error('panelName is required.');
  }
  if (!global.Editor || !Editor.Panel || typeof Editor.Panel.open !== 'function') {
    throw new Error('Editor.Panel.open is unavailable in this Cocos extension host.');
  }
  const result = await Editor.Panel.open(id);
  return { opened: true, panelName: id, result };
}

function getEditorPreference(scope, key) {
  if (!global.Editor || !Editor.Profile) {
    throw new Error('Editor.Profile is unavailable in this Cocos extension host.');
  }
  const normalizedScope = String(scope || 'project').toLowerCase();
  const target = normalizedScope === 'global' ? Editor.Profile : Editor.Profile;
  const getters = normalizedScope === 'global'
    ? ['getConfig', 'getGlobal']
    : ['getProject', 'getConfig'];
  for (const getter of getters) {
    if (typeof target[getter] === 'function') {
      return target[getter](key);
    }
  }
  throw new Error('No compatible Editor.Profile getter is available.');
}

function setEditorPreference(scope, key, value) {
  if (!global.Editor || !Editor.Profile) {
    throw new Error('Editor.Profile is unavailable in this Cocos extension host.');
  }
  const normalizedScope = String(scope || 'project').toLowerCase();
  const target = Editor.Profile;
  const setters = normalizedScope === 'global'
    ? ['setConfig', 'setGlobal']
    : ['setProject', 'setConfig'];
  for (const setter of setters) {
    if (typeof target[setter] === 'function') {
      const result = target[setter](key, value);
      return { set: true, scope: normalizedScope, key, value, method: setter, result };
    }
  }
  throw new Error('No compatible Editor.Profile setter is available.');
}

function broadcastEditorMessage(options = {}) {
  ensureEditorMessage();
  const channel = String(options.channel || '').trim();
  const message = String(options.message || '').trim();
  if (!message) {
    throw new Error('message is required.');
  }
  const payload = options.payload === undefined ? {} : options.payload;
  if (channel && typeof Editor.Message.send === 'function') {
    const result = Editor.Message.send(channel, message, payload);
    return { sent: true, mode: 'send', channel, message, payload, result };
  }
  if (typeof Editor.Message.broadcast === 'function') {
    const result = Editor.Message.broadcast(message, payload);
    return { sent: true, mode: 'broadcast', message, payload, result };
  }
  throw new Error('Neither Editor.Message.send nor Editor.Message.broadcast is available.');
}

function createCocosProjectTools({ createSchema }) {
  return [
    {
      name: 'save_current_scene',
      profile: 'full',
      description: '[core] Save the currently open Cocos scene using available editor scene messages.',
      inputSchema: createSchema({}, []),
      handler: async () => {
        const result = await tryEditorRequests([
          { channel: 'scene', method: 'save-scene' },
          { channel: 'scene', method: 'save' },
        ]);
        return { saved: true, ...result };
      },
    },
    {
      name: 'open_build_panel',
      profile: 'full',
      description: '[core] Open the Cocos build panel, defaulting to the builder panel id.',
      inputSchema: createSchema(
        {
          panelName: { type: 'string', description: 'Panel id to open. Defaults to builder.' },
        },
        []
      ),
      handler: async (args) => openPanel(args.panelName || 'builder'),
    },
    {
      name: 'get_build_status',
      profile: 'core',
      description: '[specialist] Query Cocos build/preview status using known builder message variants.',
      inputSchema: createSchema({}, []),
      handler: async () => await tryEditorRequestsStatus([
        { channel: 'builder', method: 'query-build-status' },
        { channel: 'builder', method: 'get-build-status' },
        { channel: 'builder', method: 'query-build-tasks' },
      ]),
    },
    {
      name: 'run_project_preview',
      profile: 'full',
      description: '[core] Start Cocos preview/run using known preview and builder message variants.',
      inputSchema: createSchema(
        {
          platform: { type: 'string', description: 'Optional preview platform or build target.' },
        },
        []
      ),
      handler: async (args) => await tryEditorRequests([
        { channel: 'preview', method: 'start', args: [args || {}] },
        { channel: 'preview', method: 'open-preview', args: [args || {}] },
        { channel: 'builder', method: 'preview', args: [args || {}] },
      ]),
    },
    {
      name: 'get_editor_preference',
      profile: 'full',
      description: '[core] Read a Cocos editor preference through Editor.Profile when available.',
      inputSchema: createSchema(
        {
          scope: { type: 'string', description: 'Preference scope: project or global. Defaults to project.' },
          key: { type: 'string', description: 'Preference key.' },
        },
        ['key']
      ),
      handler: async (args) => ({
        scope: args.scope || 'project',
        key: args.key,
        value: getEditorPreference(args.scope, args.key),
      }),
    },
    {
      name: 'set_editor_preference',
      profile: 'full',
      description: '[core] Write a Cocos editor preference through Editor.Profile when available.',
      inputSchema: createSchema(
        {
          scope: { type: 'string', description: 'Preference scope: project or global. Defaults to project.' },
          key: { type: 'string', description: 'Preference key.' },
          valueJson: { type: 'string', description: 'JSON encoded preference value.' },
        },
        ['key', 'valueJson']
      ),
      handler: async (args) => {
        let value;
        try {
          value = JSON.parse(args.valueJson);
        } catch (error) {
          throw new Error(`valueJson must be valid JSON: ${error.message}`);
        }
        return setEditorPreference(args.scope, args.key, value);
      },
    },
    {
      name: 'broadcast_editor_message',
      profile: 'full',
      description: '[core] Send or broadcast a Cocos editor message for advanced editor automation.',
      inputSchema: createSchema(
        {
          channel: { type: 'string', description: 'Optional Editor.Message channel for send().' },
          message: { type: 'string', description: 'Message name to send or broadcast.' },
          payload: { type: 'object', description: 'Optional JSON payload.' },
        },
        ['message']
      ),
      handler: async (args) => broadcastEditorMessage(args),
    },
  ];
}

module.exports = {
  broadcastEditorMessage,
  createCocosProjectTools,
  getEditorPreference,
  setEditorPreference,
  tryEditorRequests,
  tryEditorRequestsStatus,
};
