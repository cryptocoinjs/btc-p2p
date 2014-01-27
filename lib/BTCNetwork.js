var PeerManager = require('p2p-manager').PeerManager;
var Message = require('./Message').Message;
var Struct = require('./Struct').Struct
var sha256 = require('sha256');

var crypto = require('crypto');
var dns = require('dns');
var events = require('events');
var net = require('net');
var util = require('util');

var BTCNetwork = exports.BTCNetwork = function BTCNetwork(options) {
  events.EventEmitter.call(this);

  options = (typeof options === 'undefined')? {} : options;
  var defaultOpts = {
    'useCache': true,
    'listen': true,
    'port': 8333,
    'magic': 0xD9B4BEF9,
    'minPeers': 3,
    'maxPeers': 20,
    'idleTimeout': 30*60*1000, // time out peers we haven't heard anything from in 30 minutes
    'version': 70000,
    'services': new Buffer([1,0,0,0,0,0,0,0]),
    'clientName': 'Node.js lite peer',
    'knownHeight': 0,
    'externalIP': false
  };
  for (var name in defaultOpts) {
    if (defaultOpts.hasOwnProperty(name) && !options.hasOwnProperty(name)) {
      options[name] = defaultOpts[name];
    }
  }
  options.port = parseInt(options.port);
  options.magic = parseInt(options.magic);
  options.minPeers = parseInt(options.minPeers);
  options.maxPeers = parseInt(options.maxPeers);
  
  this.options = options;
  this.manager = new PeerManager(this.options);
  this.knownPeers = []; // List of peers who successfully do a VERSION/VERACK handshake
  this.nonce = crypto.randomBytes(8);
  this.alerts = [];
  this.state = 'new';
  
  var self = this;
  this.manager
    .on('peerConnect', function peerConnect(d) {
      self.sendVersion(d.peer); // Send VERSION message
    })
    .on('message', function handleMessage(d) {
      var cmd = d.command;
      var parserName = 'parse' + cmd.charAt(0).toUpperCase() + cmd.slice(1) + 'Message';
      if (typeof self[parserName] == 'function') { // does 'parseCommandMessage' exist as a method?
        var rs = self[parserName].call(self, d.data);
        if (rs === false) return; // Invalid data was sent; ignore it
        
        var handlerName = 'handle' + cmd.charAt(0).toUpperCase() + cmd.slice(1) + 'Message';
        if (typeof self[handlerName] == 'function') {
          if (self[handlerName].call(self, rs, d.peer) === false) return;
        }
        
        self.emit('message', {
          peer: d.peer,
          command: cmd,
          data: rs
        });
        var tmp = {
          peer: d.peer
        };
        for (prop in rs) {
          if (rs.hasOwnProperty(prop)) {
            tmp[prop] = rs[prop]; // Clone
          }
        }
        self.emit(cmd+'Message', tmp);
      } else {
        // Bubble up!
        self.emit('message', d);
        self.emit(cmd+'Message', {
          peer: d.peer,
          data: d.data
        });
      }
    })
    .on('listenConnect', self.handleListenConnect.bind(self))
    .on('status', function(d) {
      self.emit('status', d); // Bubble up!
    })
    .on('error', function(d) {
      self.emit('error', d); // Bubble up!
    });
}
util.inherits(BTCNetwork, events.EventEmitter);

BTCNetwork.prototype.IPV6_IPV4_PADDING = new Buffer([0,0,0,0,0,0,0,0,0,0,255,255]);
BTCNetwork.prototype.defaultServices = new Buffer([1,0,0,0,0,0,0,0]);

BTCNetwork.prototype.launch = function launch(seeds) {
  this.state = 'launching';
  
  if (typeof seeds != 'undefined') {
    this.manager.launch(seeds);
    this.emit('launched');
    return;
  }
  
  // Resolve DNS seeds
  var dnsSeeds = ['bitseed.xf2.org', 'dnsseed.bluematt.me', 'seed.bitcoin.sipa.be', 'dnsseed.bitcoin.dashjr.org'];
  var waiting = dnsSeeds.length;
  var ipSeeds = [];
  var self = this;
  for (var i = 0; i < dnsSeeds.length; i++) {
    dns.resolve4(dnsSeeds[i], function(err, addrs) {
      if (err) {
        console.log(err);
      } else {
        ipSeeds = ipSeeds.concat(addrs);
      }
      if (--waiting <= 0) {
        self.manager.launch(ipSeeds);
        self.emit('launched');
      }
    });
  };
};

// Other initialization things to do after we have at least one active peer
BTCNetwork.prototype._postActive = function _postActive() {
  if (self.state == 'running') return; // Ignore if we're already running
  self.state = 'running';
  self.emit('running');
  setTimeout(function() {
    self.addrPoll(); // Start polling for new peers
  }, 2000).unref();
  setInterval(function() {
    self.alertBroadcast(); // Start broadcasting known alerts periodically
  }, 60*60*1000).unref();
}

BTCNetwork.prototype.handleListenConnect = function handleListenConnect(d) {
  var self = this;
  var watchdog = setTimeout(function() {
    // No VERSION message received
    self.manager.delActive(d.peer, 'No VERSION message received from remote peer');
  }, 10*1000);
  watchdog.unref();
  d.peer.once('versionMessage', function(d) {
    // VERSION message received
    clearTimeout(watchdog);
  });
};

//// Message parsing/handling methods ////

BTCNetwork.prototype.parseAddrMessage = function parseAddrMessage(data) {
  var s = new Struct(data);
  var addrs = [];
  var addrNum = s.readVarInt();
  for (var i = 0; i < addrNum; i++) {
    addrs.push(this.getAddr(s.raw(30)));
  }
  return (s.hasFailed)? false : { addrs: addrs };
};

BTCNetwork.prototype.handleAddrMessage = function handleAddrMessage(data, peer) {
  this.manager.addPool(data.addrs); // Add these peers to the list of possible peers to connect to
};

BTCNetwork.prototype.parseAlertMessage = function parseAlertMessage(data) {
  var s = new Struct(data);
  var parsed = {};
  var msgSize = s.readVarInt();
  var message = s.raw(msgSize);
  var sigSize = s.readVarInt();
  parsed.signature = s.raw(sigSize);
  
  var s2 = new Struct(message);
  parsed.version = s2.readUInt32LE();
  if (parsed.version == 1) {
    // Original Satoshi client format
    parsed.relay_until = s2.raw(8);
    if (parsed.relay_until !== false && parsed.relay_until.readUInt32LE(4) == 0) {
      parsed.relay_until = new Date(parsed.relay_until.readUInt32LE(0)*1000);
    }
    parsed.expiration = s2.raw(8);
    if (parsed.expiration !== false && parsed.expiration.readUInt32LE(4) == 0) {
      parsed.expiration = new Date(parsed.expiration.readUInt32LE(0)*1000);
    }
    parsed.uuid = s2.readUInt32LE();
    parsed.cancel = s2.readUInt32LE();
    var num = s2.readVarInt();
    parsed.cancel_set = [];
    for (var i = 0; i < num; i++) {
      parsed.cancel_set.push(s2.readUInt32LE());
    }
    parsed.min_version = s2.readUInt32LE();
    parsed.max_version = s2.readUInt32LE();
    num = s2.readVarInt();
    parsed.subversion_set = [];
    for (var i = 0; i < num; i++) {
      parsed.subversion_set.push(s2.readVarString());
    }
    parsed.priority = s2.readUInt32LE();
    parsed.comment = s2.readVarString();
    parsed.status_bar = s2.readVarString();
    num = s2.readVarInt();
    parsed.reserved = s2.raw(num);
  }
  return (s.hasFailed || s2.hasFailed)? false : parsed;
};

BTCNetwork.prototype.handleAlertMessage = function handleAlertMessage(data, peer) {
  if (data.version !== 1) return; // Unknown version type
  if (data.expiration.getTime() < new Date().getTime()) return; // Message has expired
  
  // TODO: check signature validity
  
  // Remove alerts that this one cancels
  for(var i = 0; i < this.alerts.length; i++) {
    if (this.alerts[i].uuid < data.cancel) {
      delete this.alerts[i];
    } else {
      for (var j = 0; j < data.cancel_set.length; j++) {
        if (this.alerts[i].uuid == data.cancel_set[j]) {
          delete this.alerts[i];
          break;
        }
      }
    }
  }

  this.alerts.push(data); // Add to list of known alerts
  
  this.sayAlert(data); // Show the user
};

BTCNetwork.prototype.handleGetaddrMessage = function handleGetaddrMessage(data, peer) {
  // Send a list of peers we know and the last time they were active.
  
  // First weed out known peers who we haven't communicated with in three hours
  var threshhold = new Date().getTime() - 3*60*60*1000;
  for (var i = 0; i < this.knownPeers.length; i++) {
    if (this.knownPeers[i].lastSeen.getTime() < threshhold || net.isIP(this.knownPeers[i].host.host) == 0) {
      delete this.knownPeers[i];
    }
  }
  var IPV6_IPV4_PADDING = this.IPV6_IPV4_PADDING;
  
  // Assenble message
  var msg = new Message();
  var num = (this.knownPeers.length > 1000)? 1000 : this.knownPeers.length;
  msg.putVarInt(num);
  for (var i = 0; i < num; i++) {
    msg.putInt32(this.knownPeers[i].lastSeen);
    msg.put(this.knownPeers[i].info.services);
    msg.put(compileAddress(this.knownPeers[i].host.host));
    msg.putInt16(this.knownPeers[i].host.port);
  }
  peer.send('addr', msg.raw());
  
  function compileAddress(adddr) {
    out = new Buffer(16);
    IPV6_IPV4_PADDING.copy(out);
    if (net.isIP(addr) == 4) {
      // IPv4
      var octets = addr.split('.');
      for (var i = 0; i < 4; i++) {
        out[12+i] = parseInt(octets[i]);
      }
    } else {
      // IPv6
      var octets = addr.split(':');
      
      // First make them all canonical
      for(var i = 0; i < octets.length; i++) {
        if (octets[i] == '') {
          // Insert zeroes here
          while(octets.length < 8) {
            octets.splice(i, 0, '0000');
          }
          // And change self to zeroes
          octets[i] = '0000';
        } else {
          var hex = ('0000'+octets[i]).slice(-4);
        }
      }
      
      // Now apply to buffer
      for (var i = 0; i < octets.length; i++) {
        out.write(octets[i], i*2, 2, 'hex');
      }
    }
    return out;
  }
};

BTCNetwork.prototype.parseGetblocksMessage = function parseGetblocksMessage(data) {
  var s = new Struct(data);
  var parsed = {};
  parsed.version = s.readUInt32LE();
  var hashCount = s.readVarInt();
  parsed.hashes = [];
  for (var i = 0; i < hashCount; i++) {
    parsed.hashes.push(s.raw(32));
  }
  parsed.hash_stop = s.raw(32);
  return (s.hasFailed)? false : parsed;
};

BTCNetwork.prototype.parseGetheadersMessage = function parseGetHeadersMessage(data) {
  return this.parseGetblocksMessage(data);
};

BTCNetwork.prototype.parseHeadersMessage = function parseHeadersMessage(data) {
  var s = new Struct(data);
  var headers = [];
  var num = s.readVarInt();
  for (var i = 0; i < num; i++) {
    var header = {};
    header.version = s.readUInt32LE();
    header.prev_block = s.raw(32);
    header.merkle_root = s.raw(32);
    header.timestamp = new Date(s.readUInt32LE()*1000);
    header.difficulty = s.readUInt32LE();
    header.nonce = s.raw(4);
    header.txn_count = s.readVarInt();
    headers.push(header);
  }
  return (s.hasFailed)? false : { headers: headers };
};

BTCNetwork.prototype.invTypes = {
  '0': 'error',
  '1': 'transaction',
  '2': 'block'
};
BTCNetwork.prototype.parseInvMessage = function parseInvMessage(data) {
  var s = new Struct(data);
  var items = [];
  var invNum = s.readVarInt();
  for (var i = 0; i < invNum; i++) {
    var inv_vect = {};
    inv_vect.type = s.readUInt32LE();
    inv_vect.type_name = (typeof this.invTypes[inv_vect.type] != 'undefined')? this.invTypes[inv_vect.type] : 'unknown';
    inv_vect.hash = s.raw(32);
    items.push(inv_vect);
  }
  return (s.hasFailed)? false : { items: items };
};

BTCNetwork.prototype.handleInvMessage = function handleInvMessage(data, peer) {
  for (var i = 0; i < data.items.length; i++) {
    this.emit(data.items[i].type_name+'Inv', {
      peer: peer,
      hash: data.items[i].hash
    });
  }
};

BTCNetwork.prototype.parseNotfoundMessage = function parseNotfoundMessage(data) {
  return this.parseInvMessage(data);
};

BTCNetwork.prototype.parsePingMessage = function parsePingMessage(data) {
  var s = new Struct(data);
  var parsed = { nonce: s.raw(8) };
  return (s.hasFailed)? false : parsed;
};

BTCNetwork.prototype.handlePingMessage = function handlePingMessage(data, peer) {
  // Send a PONG message back to the peer
  var msg = new Message()
    .put(data.nonce);
  peer.send('pong', msg.raw());
};

BTCNetwork.prototype.parsePongMessage = function parsePongMessage(data) {
  return this.parsePingMessage(data);
};

BTCNetwork.prototype.parseTxMessage = function parseTxMessage(data) {
  var s = new Struct(data);
  var parsed = {};
  parsed.version = s.readUInt32LE();
  var inCount = s.readVarInt();
  parsed.txIn = [];
  for (var i = 0; i < inCount; i++) {
    var txIn = { outPoint: {} };
    txIn.outPoint.hash = s.raw(32);
    txIn.outPoint.index = s.readUInt32LE();
    var scriptSize = s.readVarInt();
    txIn.signature = s.raw(scriptSize);
    txIn.sequence = s.readUInt32LE();
    parsed.txIn.push(txIn);
  }
  var outCount = s.readVarInt();
  parsed.txOut = [];
  for (i = 0; i < outCount; i++) {
    var txOut = {};
    txOut.value = s.raw(8);
    if (tsOut.value !== false && txOut.value.readUInt32LE(4) == 0) {
      // Actually a 32-bit number
      txOut.value = txOut.value.readUInt32LE(0);
    }
    var scriptSize = s.readVarInt();
    txOut.script = s.raw(scriptSize);
    parsed.txOut.push(txOut);
  }
  parsed.lock = s.readUInt32LE();

  parsed.raw = new Buffer(data.length);
  data.copy(parsed.raw);
  parsed.hash = new Buffer(sha256.x2(data, { asBytes: true }));
  return (s.hasFailed)? false : parsed;
};

BTCNetwork.prototype.parseVersionMessage = function parseVersionMessage(data, peer) {
  var s = new Struct(data);
  var parsed = {};
  parsed.version = s.readUInt32LE(0);
  parsed.services = s.raw(8);
  parsed.time = s.raw(8);
  if (parsed.time !== false && parsed.time.readUInt32LE(4) == 0) {
    // 32-bit date; no need to keep as buffer
    parsed.time = new Date(parsed.time.readUInt32LE(0)*1000);
  }
  parsed.addr_recv = this.getAddr(s.raw(26));
  parsed.addr_from = this.getAddr(s.raw(26));
  parsed.nonce = s.raw(8);
  parsed.client = s.readVarString();
  parsed.height = s.readUInt32LE();
  return (s.hasFailed)? false : parsed;
};

BTCNetwork.prototype.handleVersionMessage = function handleVersionMessage(data, peer) {
  if (data.nonce.toString('hex') === this.nonce.toString('hex')) {
    // We connected to ourselves!
    this.manager.delActive(peer, 'connected to self');
    return;
  }
  
  peer.send('verack'); // Send VERACK message
  peer.state = 'active';
  this.knownPeers.push(peer);
  this._postActive();
  
  if (this.options.externalIP == false || (this.options.externalIP.toString('hex') != data.addr_recv.hostRaw.toString('hex') && data.addr_recv.hostRaw.slice(10,16).toHex != '000000000000')) {
    this.options.externalIP = data.addr_recv.hostRaw;
    this._error('External address discovered to be '+this.options.externalIP.toString('hex'), 'info');
  }
  // Save info for this peer
  if (typeof peer.info == 'undefined') {
    peer.info = {};
  }
  peer.info.version = data.version;
  peer.info.services = data.services;
  peer.info.nonce = data.nonce;
  peer.info.client = data.client;
  peer.info.knownHeight = data.height;
};

//// Public utility methods ////

BTCNetwork.prototype.sendVersion = function sendVersion(p) {
  // Assemble remote address
  var addr = p.socket.remoteAddress;
  var remote_addr = new Buffer(26);
  remote_addr.fill(0);
  this.defaultServices.copy(remote_addr, 0, 0, 8);
  if (net.isIP(addr) == 4) {
    this.IPV6_IPV4_PADDING.copy(remote_addr, 8, 0, 12);
    var octets = addr.split('.');
    for (var i = 0; i < octets.length; i++) {
      remote_addr[i+20] = octets[i];
    }
  } else {
    // TODO parse IPv6 address
  }
  remote_addr.writeUInt16BE(p.socket.remotePort, 24);
  
  // Assemble local address
  var local_addr = new Buffer(26);
  local_addr.fill(0);
  this.options.services.copy(local_addr, 0, 0, 8);
  if (this.options.externalIP !== false) {
    this.options.externalIP.copy(local_addr, 8, 0, 16);
  }
  
  var msg = new Message()
    .putInt32(this.options.version) // version
    .putInt64(this.options.services) // services
    .putInt64(Math.round(new Date().getTime()/1000)) // timestamp
    .put(remote_addr) // addr_recv
    .put(local_addr) // addr_from
    .putInt64(this.nonce) // nonce
    .putVarString(this.options.clientName) // client
    .putInt32(this.options.knownHeight); // start_height

  var self = this;
  var watchdog = setTimeout(function() {
    // No VERACK received; disconnect
    self.manager.delActive(p, 'Failed to send VERACK after VERSION message');
  }, 10000);
  watchdog.unref();
  p.once('verackMessage', function() {
    // VERACK received; this peer is active now
    clearTimeout(watchdog);
    p.state = 'active';
    self.knownPeers.push(p);
    self._postActive();
  });
  p.send('version', msg.raw());
  p.state = 'awaiting-verack';
};

// This method call is debounced to better batch the requests.
// It waits until this method has not been called for one second before actually sending the request.
// Send force = true to override this and trigger a request now.
BTCNetwork.prototype.getData = function getData(inventory, peer, callback, force) {
  if (!Array.isArray(inventory)) {
    inventory = [inventory];
  }
  if (typeof peer.info.pendingGetData == 'undefined') {
    peer.info.pendingGetData = [];
  }
  peer.info.pendingGetData = peer.info.pendingGetData.concat(inventory);
  
  // Add callback to the list of functions to notify when this batch of data is ready
  if (typeof peer.info.getDataListeners == 'undefined') {
    peer.info.getDataListeners = [];
  }
  if (typeof callback == 'function') {
    peer.info.getDataListeners.push(callback);
  }
  
  if (force !== true && peer.info.pendingGetData.length < 50) {
    clearTimeout(peer.info.getDataTimeout);
    var self = this;
    peer.info.getDataTimeout = setTimeout(function() {
      self.getData([], peer, false, true); // Force send now
    }, 1000);
    return;
  }
  
  // Send the request
  var toSend = peer.info.pendingGetData.slice(0); // Make local copy
  peer.info.pendingGetData = []; // Clear original
  var toCallback = peer.info.getDataListeners.slice(0); // Make local copy
  peer.info.getDataListeners = []; // Clear original
  
  if (toSend.length == 0) return; 
  var waitingFor = toSend.length;
  console.log('Sending request for:', toSend);
  
  var msg = new Message();
  msg.putVarInt(toSend.length);
  for (var i = 0; i < toSend.length; i++) {
    var inv = toSend[i];
    var raw = new Buffer(36);
    raw.writeUInt32LE(inv.type, 0);
    inv.hash.copy(raw, 4);
    msg.put(raw);
  }

  var doCallbacks = function(err, rs) {
    console.log('firing callbacks');
    for (var i = 0; i < toCallback.length; i++) {
      toCallback[i].call(peer, err, rs);
    }
  };
  
  if (this.state == 'shutdown') {
    doCallbacks('Shutdown in progress'); // Abort
    return;
  }
  
  console.log(waitingFor+' items pending');
  var items = [];
  var watchdog = setTimeout(function watchdog() {
    if (waitingFor > 0) {
      doCallbacks('Peer unresponsive');
    }
  }, 30000);
  watchdog.unref();
  var addResult = function addResult(item) {
    console.log('add result fired with '+waitingFor+' to go');
    if (item !== false) {
      items.push(item);
    }
    if (--waitingFor <= 0) {
      // We were the last one
      peer.removeListener('notfoundMessage', notFoundHandler);
      peer.removeListener('txMessage', txHandler);
      peer.removeListener('blockMessage', blockHandler);
      if (items.length == 0) {
        doCallbacks('Not Found', false);
      } else {
        doCallbacks(false, items);
      }
      return;
    }
    console.log('waiting for '+waitingFor+' more objects');
  };
  var self = this;
  var notFoundHandler = function notFoundHandler(d) {
    var numMissing = d.data.readUInt32LE(0);
    console.log(numMissing+' reported missing');
    waitingFor = waitingFor - numMissing + 1;
    addResult(false);
  };
  var txHandler = function txHandler(d) {
    console.log('One transaction came in');
    addResult({'type': 'tx', 'data': self.parseTxMessage(d.data, d.peer)});
  };
  var blockHandler = function blockHandler(d) {
    console.log('One block came in');
    // TODO: Parse the result before returning
    addResult({'type': 'block', 'data': d.data});
  };
  
  peer.send('getdata', msg.raw());
  peer.on('notfoundMessage', notFoundHandler);
  peer.on('txMessage', txHandler);
  peer.on('blockMessage', blockHandler); 
};

//// Polling methods ////

BTCNetwork.prototype.addrPoll = function addrPoll() {
  var peers = this.manager.send(5, 'state', 'active', 'getaddr');
  if (peers === false) {
    this._error('No peers available to poll for peers', 'info');
  } else {
    var count = 0;
    for(var i in peers) {
      if (peers.hasOwnProperty(i)) count++;
    }
    this._error('Sent GETADDR to '+count+' peers', 'info');
  }
  var self = this;
  setTimeout(function() { self.addrPoll(); }, 60*1000).unref(); // Poll for peers again in a minute
};

BTCNetwork.prototype.getAddr = function getAddr(buff) {
  var IPV6_IPV4_PADDING = this.IPV6_IPV4_PADDING;
  var addr = {};
  if (buff.length == 30) {
    // with timestamp and services; from ADDR message
    addr.timestamp = new Date(buff.readUInt32LE(0)*1000);
    addr.services = new Buffer(8);
    buff.copy(addr.services, 0, 4, 12);
    addr.hostRaw = new Buffer(16);
    buff.copy(addr.hostRaw, 0, 12, 28);
    addr.host = getHost(addr.hostRaw);
    addr.port = buff.readUInt16BE(28);
  }  if (buff.length == 26) {
    // with services, no time; from VERSION message
    addr.services = new Buffer(8);
    buff.copy(addr.services, 0, 0, 8);
    addr.hostRaw = new Buffer(16);
    buff.copy(addr.hostRaw, 0, 8, 24);
    addr.host = getHost(addr.hostRaw);
    addr.port = buff.readUInt16BE(24);
  } else if (buff.length == 18) {
    // IP and port alone
    addr.hostRaw = new Buffer(16);
    buff.copy(addr.hostRaw, 0, 0, 16);
    addr.host = getHost(addr.hostRaw);
    addr.port = buff.readUInt16BE(16);
  }
  return addr;
  
  function getHost(buff) {
    if (buff.slice(0, 12).toString('hex') == IPV6_IPV4_PADDING.toString('hex')) {
      // IPv4
      return Array.prototype.join.apply(buff.slice(12), ['.']);
    } else {
      // IPv6
      return buff.slice(0, 16).toString('hex')
        .match(/(.{1,4})/g)
        .join(':')
        .replace(/\:(0{1,3})/g, ':')
        .replace(/^(0{1,3})/g, '');
    }
  }
};

// Go through the list of known alerts, and show them to the user, and remind all connected peers
BTCNetwork.prototype.alertBroadcast = function alertBroadcast() {
  for (var i = 0; i < this.alerts.length; i++) {
    this.sayAlert(this.alerts[i]);
    this.manager.send('all', 'state', 'active', 'alert', this.compileAlert(this.alerts[i]));
  }
};

// Show an alert to the user
BTCNetwork.prototype.sayAlert = function sayAlert(alert) {
  if (alert.version !== 1) return; // Unknown alert type
  this._error('('+alert.min_version+' - '+alert.max_version+'): '+alert.status_bar, 'warning');
};

// Compile a Javascript object into an alert message
BTCNetwork.prototype.compileAlert = function compileAlert(data) {
  var msg = new Message();
  if (data.version !== 1) return false; // Unknown message version
  var payload = new Message(this.options.magic)
    .putInt32(data.version)
    .putInt64(data.relay_until)
    .putInt64(data.expiration)
    .putInt32(data.uuid)
    .putInt32(data.cancel)
    .putVarInt(data.cancel_set.length);
  for (var i = 0; i < data.cancel_set.length; i++) {
    payload.putInt32(data.cancel_set[i]);
  }
  payload
    .putInt32(data.min_version)
    .putInt32(data.max_version)
    .putVarInt(data.subversion_set.length);
  for (var i = 0; i < data.subversion_set.length; i++) {
    payload.putVarString(data.subversion_set[i]);
  }
  payload
    .putInt32(data.priority)
    .putVarString(data.comment)
    .putVarString(data.status_bar)
    .putVarInt(data.reserved.length)
    .put(data.reserved);
  
  payload = payload.raw();
  msg
    .putVarInt(payload.length)
    .put(payload)
    .putVarInt(data.signature.length)
    .put(data.signature);
  return msg.raw();
};

//// Utility methods ////

BTCNetwork.prototype.shutdown = function shutdown() {
  this.state = 'shutdown';
  this.manager.shutdown();
};

// Trigger an error message. Severity is one of 'info', 'notice', 'warning', or 'error' (in increasing severity)
BTCNetwork.prototype._error = function _error(message, severity) {
  severity = severity || 'warning';
  this.emit('error', {
    severity: severity,
    message: message
  });
};
