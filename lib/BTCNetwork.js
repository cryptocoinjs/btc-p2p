var PeerManager = require('p2p-manager').PeerManager;
var Message = require('./Message').Message;

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
  this.nonce = crypto.randomBytes(8);
  this.state = 'new';
  
  this.pendingGetData = {};
  this.getDataDebounce = false;
  
  var self = this;
  this.manager
    .on('peerConnect', function peerConnect(d) {
      self.sendVersion(d.peer); // Send VERSION message
    })
    .on('message', function handleMessage(d) {
      var cmd = d.command;
      var handlerName = 'parse' + cmd.charAt(0).toUpperCase() + cmd.slice(1) + 'Message';
      if (typeof self[handlerName] == 'function') { // does 'parseCommandMessage' exist as a method?
        var rs = self[handlerName].call(self, d.data, d.peer);
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
      self.emit('peerStatus', d); // Bubble up!
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

BTCNetwork.prototype.parseAddrMessage = function parseAddrMessage(data, peer) {
  var addrs = [];
  var addrNum = Message.prototype.getVarInt(data, 0);
  for (var i = addrNum[1]; i < data.length; i += 30) {
    addrs.push(this.getAddr(data.slice(i, i+30)));
  }
  if (addrs.length != addrNum[0]) {
    this._error('Was supposed to get '+addrNum[0]+' addresses, but got '+parsed.length+' instead', 'info');
  }
  this.manager.addPool(addrs); // Add these peers to the list of possible peers to connect to
  return { addrs: addrs };
};

BTCNetwork.prototype.invTypes = {
  '0': 'error',
  '1': 'transaction',
  '2': 'block'
};
BTCNetwork.prototype.parseInvMessage = function parseInvMessage(data, peer) {
  var items = [];
  var invNum = Message.prototype.getVarInt(data, 0);
  for (var i = invNum[1]; i < data.length; i += 36) {
    var inv_vect = {};
    var tmp = data.slice(i, i+36);
    inv_vect.type = tmp.readUInt32LE(0);
    inv_vect.type_name = (typeof this.invTypes[inv_vect.type] != 'undefined')? this.invTypes[inv_vect.type] : 'unknown';
    inv_vect.hash = new Buffer(32);
    tmp.copy(inv_vect.hash, 0, 4);
    items.push(inv_vect);
    this.emit(inv_vect.type_name+'Inv', {
      peer: peer,
      hash: inv_vect.hash
    });
  }
  if (items.length != invNum[0]) {
    this._error('Was supposted to get '+invNum[0]+' inventory items, but got '+items.length+' instead', 'info');
  }
  return { items: items };
};

BTCNetwork.prototype.parseTxMessage = function parseTxMessage(data, peer) {
  var parsed = {};
  parsed.version = data.readUInt32LE(0);
  var inCount = Message.prototype.getVarInt(data, 4);
  var counter = 4+inCount[1];
  parsed.txIn = [];
  for (var i = 0; i < inCount[0]; i++) {
    var txIn = { outPoint: {} };
    txIn.outPoint.hash = new Buffer(32);
    data.copy(txIn.outPoint.hash, 0, counter, counter+32);
    txIn.outPoint.index = data.readUInt32LE(counter+32);
    counter += 36;
    var scriptSize = Message.prototype.getVarInt(data, counter);
    txIn.signature = new Buffer(scriptSize[0]);
    data.copy(txIn.signature, 0, counter+scriptSize[1], counter+scriptSize[1]+scriptSize[0]);
    counter += scriptSize[0]+scriptSize[1];
    txIn.sequence = data.readUInt32LE(counter);
    counter += 4;
    parsed.txIn.push(txIn);
  }
  var outCount = Message.prototype.getVarInt(data, counter);
  counter += outCount[1];
  parsed.txOut = [];
  for (i = 0; i < outCount[0]; i++) {
    var txOut = {};
    txOut.value = Buffer(8);
    data.copy(txOut.value, 0, counter, counter+8);
    if (txOut.value.readUInt32LE(4) == 0) {
      // Actually a 32-bit number
      txOut.value = txOut.value.readUInt32LE(0);
    }
    counter += 8;
    var scriptSize = Message.prototype.getVarInt(data, counter);
    txOut.script = new Buffer(scriptSize[0]);
    data.copy(txOut.script, 0, counter+scriptSize[1], counter+scriptSize[1]+scriptSize[0]);
    counter += scriptSize[0]+scriptSize[1];
    parsed.txOut.push(txOut);
  }
  parsed.lock = data.readUInt32LE(counter);
  return parsed;
};

BTCNetwork.prototype.parseVersionMessage = function parseVersionMessage(data, peer) {
  var parsed = {};
  parsed.version = data.readUInt32LE(0);
  parsed.services = new Buffer(8);
  data.copy(parsed.services, 0, 4, 12);
  parsed.time = new Buffer(8);
  data.copy(parsed.time, 0, 12, 20);
  if (parsed.time.readUInt32LE(4) == 0) {
    // 32-bit date; no need to keep as buffer
    parsed.time = new Date(parsed.time.readUInt32LE(0)*1000);
  }
  parsed.addr_recv = this.getAddr(data.slice(20, 46));
  parsed.addr_from = this.getAddr(data.slice(46, 72));
  parsed.nonce = new Buffer(8);
  data.copy(parsed.nonce, 0, 72, 80);
  parsed.client = Message.prototype.getVarString(data, 80);
  parsed.height = data.readUInt32LE(data.length-4);
  console.log('VERSION:', parsed);
  
  if (parsed.nonce.toString('hex') === this.nonce.toString('hex')) {
    // We connected to ourselves!
    this.manager.delActive(peer, 'connected to self');
    return;
  }
  
  peer.send('verack'); // Send VERACK message
  
  if (this.options.externalIP == false || (this.options.externalIP.toString('hex') != parsed.addr_recv.hostRaw.toString('hex') && parsed.addr_recv.hostRaw.slice(10,16).toHex != '000000000000')) {
    this.options.externalIP = parsed.addr_recv.hostRaw;
    this._error('External address discovered to be '+this.options.externalIP.toString('hex'), 'info');
  }
  // Save info for this peer
  if (typeof peer.info == 'undefined') {
    peer.info = {};
  }
  peer.info.version = parsed.version;
  peer.info.services = parsed.services;
  peer.info.nonce = parsed.nonce;
  peer.info.client = parsed.client;
  peer.info.knownHeight = parsed.height;
  
  return parsed;
};

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
  
  var msg = new Message(p.magicBytes, true)
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
  }, 10000).unref();
  p.once('verackMessage', function() {
    // VERACK received; this peer is active now
    clearTimeout(watchdog);
    p.state = 'active';
    if (self.state == 'launching') {
      // First peer to connect updates state
      self.state = 'running';
      self.emit('running');
      setTimeout(function() {
        self.addrPoll(); // Start polling for new peers
      }, 2000).unref();
    }
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
  
  var msg = new Message(this.options.magic, true);
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
  }, 30000).unref();
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
