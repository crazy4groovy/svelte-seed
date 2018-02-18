var app = (function () {
'use strict';

function noop() {}

function assign(target) {
	var k,
		source,
		i = 1,
		len = arguments.length;
	for (; i < len; i++) {
		source = arguments[i];
		for (k in source) target[k] = source[k];
	}

	return target;
}

function appendNode(node, target) {
	target.appendChild(node);
}

function insertNode(node, target, anchor) {
	target.insertBefore(node, anchor);
}

function detachNode(node) {
	node.parentNode.removeChild(node);
}

function reinsertBefore(after, target) {
	var parent = after.parentNode;
	while (parent.firstChild !== after) target.appendChild(parent.firstChild);
}

function destroyEach(iterations) {
	for (var i = 0; i < iterations.length; i += 1) {
		if (iterations[i]) iterations[i].d();
	}
}

function createFragment() {
	return document.createDocumentFragment();
}

function createElement(name) {
	return document.createElement(name);
}

function createText(data) {
	return document.createTextNode(data);
}

function createComment() {
	return document.createComment('');
}

function addListener(node, event, handler) {
	node.addEventListener(event, handler, false);
}

function removeListener(node, event, handler) {
	node.removeEventListener(event, handler, false);
}

function setAttribute(node, attribute, value) {
	node.setAttribute(attribute, value);
}

function linear(t) {
	return t;
}

function generateRule(
	a,
	b,
	delta,
	duration,
	ease,
	fn
) {
	var keyframes = '{\n';

	for (var p = 0; p <= 1; p += 16.666 / duration) {
		var t = a + delta * ease(p);
		keyframes += p * 100 + '%{' + fn(t) + '}\n';
	}

	return keyframes + '100% {' + fn(b) + '}\n}';
}

// https://github.com/darkskyapp/string-hash/blob/master/index.js
function hash(str) {
	var hash = 5381;
	var i = str.length;

	while (i--) hash = ((hash << 5) - hash) ^ str.charCodeAt(i);
	return hash >>> 0;
}

function wrapTransition(component, node, fn, params, intro, outgroup) {
	var obj = fn(node, params);
	var duration = obj.duration || 300;
	var ease = obj.easing || linear;
	var cssText;

	// TODO share <style> tag between all transitions?
	if (obj.css && !transitionManager.stylesheet) {
		var style = createElement('style');
		document.head.appendChild(style);
		transitionManager.stylesheet = style.sheet;
	}

	if (intro) {
		if (obj.css && obj.delay) {
			cssText = node.style.cssText;
			node.style.cssText += obj.css(0);
		}

		if (obj.tick) obj.tick(0);
	}

	return {
		t: intro ? 0 : 1,
		running: false,
		program: null,
		pending: null,
		run: function(intro, callback) {
			var program = {
				start: window.performance.now() + (obj.delay || 0),
				intro: intro,
				callback: callback
			};

			if (obj.delay) {
				this.pending = program;
			} else {
				this.start(program);
			}

			if (!this.running) {
				this.running = true;
				transitionManager.add(this);
			}
		},
		start: function(program) {
			component.fire(program.intro ? 'intro.start' : 'outro.start', { node: node });

			program.a = this.t;
			program.b = program.intro ? 1 : 0;
			program.delta = program.b - program.a;
			program.duration = duration * Math.abs(program.b - program.a);
			program.end = program.start + program.duration;

			if (obj.css) {
				if (obj.delay) node.style.cssText = cssText;

				program.rule = generateRule(
					program.a,
					program.b,
					program.delta,
					program.duration,
					ease,
					obj.css
				);

				transitionManager.addRule(program.rule, program.name = '__svelte_' + hash(program.rule));

				node.style.animation = (node.style.animation || '')
					.split(', ')
					.filter(function(anim) {
						// when introing, discard old animations if there are any
						return anim && (program.delta < 0 || !/__svelte/.test(anim));
					})
					.concat(program.name + ' ' + duration + 'ms linear 1 forwards')
					.join(', ');
			}

			this.program = program;
			this.pending = null;
		},
		update: function(now) {
			var program = this.program;
			if (!program) return;

			var p = now - program.start;
			this.t = program.a + program.delta * ease(p / program.duration);
			if (obj.tick) obj.tick(this.t);
		},
		done: function() {
			var program = this.program;
			this.t = program.b;
			if (obj.tick) obj.tick(this.t);
			if (obj.css) transitionManager.deleteRule(node, program.name);
			program.callback();
			program = null;
			this.running = !!this.pending;
		},
		abort: function() {
			if (obj.tick) obj.tick(1);
			if (obj.css) transitionManager.deleteRule(node, this.program.name);
			this.program = this.pending = null;
			this.running = false;
		}
	};
}

var transitionManager = {
	running: false,
	transitions: [],
	bound: null,
	stylesheet: null,
	activeRules: {},

	add: function(transition) {
		this.transitions.push(transition);

		if (!this.running) {
			this.running = true;
			requestAnimationFrame(this.bound || (this.bound = this.next.bind(this)));
		}
	},

	addRule: function(rule, name) {
		if (!this.activeRules[name]) {
			this.activeRules[name] = true;
			this.stylesheet.insertRule('@keyframes ' + name + ' ' + rule, this.stylesheet.cssRules.length);
		}
	},

	next: function() {
		this.running = false;

		var now = window.performance.now();
		var i = this.transitions.length;

		while (i--) {
			var transition = this.transitions[i];

			if (transition.program && now >= transition.program.end) {
				transition.done();
			}

			if (transition.pending && now >= transition.pending.start) {
				transition.start(transition.pending);
			}

			if (transition.running) {
				transition.update(now);
				this.running = true;
			} else if (!transition.pending) {
				this.transitions.splice(i, 1);
			}
		}

		if (this.running) {
			requestAnimationFrame(this.bound);
		} else if (this.stylesheet) {
			var i = this.stylesheet.cssRules.length;
			while (i--) this.stylesheet.deleteRule(i);
			this.activeRules = {};
		}
	},

	deleteRule: function(node, name) {
		node.style.animation = node.style.animation
			.split(', ')
			.filter(function(anim) {
				return anim.slice(0, name.length) !== name;
			})
			.join(', ');
	}
};

function blankObject() {
	return Object.create(null);
}

function destroy(detach) {
	this.destroy = noop;
	this.fire('destroy');
	this.set = this.get = noop;

	if (detach !== false) this._fragment.u();
	this._fragment.d();
	this._fragment = this._state = null;
}

function destroyDev(detach) {
	destroy.call(this, detach);
	this.destroy = function() {
		console.warn('Component was already destroyed');
	};
}

function _differs(a, b) {
	return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
}

function _differsImmutable(a, b) {
	return a != a ? b == b : a !== b;
}

function dispatchObservers(component, group, changed, newState, oldState) {
	for (var key in group) {
		if (!changed[key]) continue;

		var newValue = newState[key];
		var oldValue = oldState[key];

		var callbacks = group[key];
		if (!callbacks) continue;

		for (var i = 0; i < callbacks.length; i += 1) {
			var callback = callbacks[i];
			if (callback.__calling) continue;

			callback.__calling = true;
			callback.call(component, newValue, oldValue);
			callback.__calling = false;
		}
	}
}

function fire(eventName, data) {
	var handlers =
		eventName in this._handlers && this._handlers[eventName].slice();
	if (!handlers) return;

	for (var i = 0; i < handlers.length; i += 1) {
		handlers[i].call(this, data);
	}
}

function get(key) {
	return key ? this._state[key] : this._state;
}

function init(component, options) {
	component._observers = { pre: blankObject(), post: blankObject() };
	component._handlers = blankObject();
	component._bind = options._bind;

	component.options = options;
	component.root = options.root || component;
	component.store = component.root.store || options.store;
}

function observe(key, callback, options) {
	var group = options && options.defer
		? this._observers.post
		: this._observers.pre;

	(group[key] || (group[key] = [])).push(callback);

	if (!options || options.init !== false) {
		callback.__calling = true;
		callback.call(this, this._state[key]);
		callback.__calling = false;
	}

	return {
		cancel: function() {
			var index = group[key].indexOf(callback);
			if (~index) group[key].splice(index, 1);
		}
	};
}

function observeDev(key, callback, options) {
	var c = (key = '' + key).search(/[^\w]/);
	if (c > -1) {
		var message =
			'The first argument to component.observe(...) must be the name of a top-level property';
		if (c > 0)
			message += ", i.e. '" + key.slice(0, c) + "' rather than '" + key + "'";

		throw new Error(message);
	}

	return observe.call(this, key, callback, options);
}

function on(eventName, handler) {
	if (eventName === 'teardown') return this.on('destroy', handler);

	var handlers = this._handlers[eventName] || (this._handlers[eventName] = []);
	handlers.push(handler);

	return {
		cancel: function() {
			var index = handlers.indexOf(handler);
			if (~index) handlers.splice(index, 1);
		}
	};
}

function onDev(eventName, handler) {
	if (eventName === 'teardown') {
		console.warn(
			"Use component.on('destroy', ...) instead of component.on('teardown', ...) which has been deprecated and will be unsupported in Svelte 2"
		);
		return this.on('destroy', handler);
	}

	return on.call(this, eventName, handler);
}

function set(newState) {
	this._set(assign({}, newState));
	if (this.root._lock) return;
	this.root._lock = true;
	callAll(this.root._beforecreate);
	callAll(this.root._oncreate);
	callAll(this.root._aftercreate);
	this.root._lock = false;
}

function _set(newState) {
	var oldState = this._state,
		changed = {},
		dirty = false;

	for (var key in newState) {
		if (this._differs(newState[key], oldState[key])) changed[key] = dirty = true;
	}
	if (!dirty) return;

	this._state = assign({}, oldState, newState);
	this._recompute(changed, this._state);
	if (this._bind) this._bind(changed, this._state);

	if (this._fragment) {
		dispatchObservers(this, this._observers.pre, changed, this._state, oldState);
		this._fragment.p(changed, this._state);
		dispatchObservers(this, this._observers.post, changed, this._state, oldState);
	}
}

function setDev(newState) {
	if (typeof newState !== 'object') {
		throw new Error(
			this._debugName + '.set was called without an object of data key-values to update.'
		);
	}

	this._checkReadOnly(newState);
	set.call(this, newState);
}

function callAll(fns) {
	while (fns && fns.length) fns.shift()();
}

function _mount(target, anchor) {
	this._fragment.m(target, anchor);
}

function _unmount() {
	if (this._fragment) this._fragment.u();
}

function isPromise(value) {
	return value && typeof value.then === 'function';
}

function removeFromStore() {
	this.store._remove(this);
}

var protoDev = {
	destroy: destroyDev,
	get: get,
	fire: fire,
	observe: observeDev,
	on: onDev,
	set: setDev,
	teardown: destroyDev,
	_recompute: noop,
	_set: _set,
	_mount: _mount,
	_unmount: _unmount,
	_differs: _differs
};

function fade ( node, ref ) {
	var delay = ref.delay; if ( delay === void 0 ) delay = 0;
	var duration = ref.duration; if ( duration === void 0 ) duration = 400;

	var o = +getComputedStyle( node ).opacity;

	return {
		delay: delay,
		duration: duration,
		css: function (t) { return ("opacity: " + (t * o)); }
	};
}

function cubicOut(t) {
  var f = t - 1.0;
  return f * f * f + 1.0
}

function fly(
	node,
	ref
) {
	var delay = ref.delay; if ( delay === void 0 ) delay = 0;
	var duration = ref.duration; if ( duration === void 0 ) duration = 400;
	var easing = ref.easing; if ( easing === void 0 ) easing = cubicOut;
	var x = ref.x; if ( x === void 0 ) x = 0;
	var y = ref.y; if ( y === void 0 ) y = 0;

	var o = +getComputedStyle(node).opacity;

	return {
		delay: delay,
		duration: duration,
		easing: easing,
		css: function (t) { return ("transform: translate(" + ((1 - t) * x) + "px, " + ((1 - t) * y) + "px); opacity: " + (t * o)); }
	};
}

/* This program is free software. It comes without any warranty, to
     * the extent permitted by applicable law. You can redistribute it
     * and/or modify it under the terms of the Do What The Fuck You Want
     * To Public License, Version 2, as published by Sam Hocevar. See
     * http://www.wtfpl.net/ for more details. */
var leftPad_1 = leftPad;

var cache = [
  '',
  ' ',
  '  ',
  '   ',
  '    ',
  '     ',
  '      ',
  '       ',
  '        ',
  '         '
];

function leftPad (str, len, ch) {
  // convert `str` to a `string`
  str = str + '';
  // `len` is the `pad`'s length now
  len = len - str.length;
  // doesn't need to pad
  if (len <= 0) return str;
  // `ch` defaults to `' '`
  if (!ch && ch !== 0) ch = ' ';
  // convert `ch` to a `string` cuz it could be a number
  ch = ch + '';
  // cache common use cases
  if (ch === ' ' && len < 10) return cache[len] + str;
  // `pad` starts with an empty string
  var pad = '';
  // loop
  while (true) {
    // add `ch` to `pad` if `len` is odd
    if (len & 1) pad += ch;
    // divide `len` by 2, ditch the remainder
    len >>= 1;
    // "double" the `ch` so this operation count grows logarithmically on `len`
    // each time `ch` is "doubled", the `len` would need to be "doubled" too
    // similar to finding a value in binary search tree, hence O(log(n))
    if (len) ch += ch;
    // `len` is 0, exit the loop
    else break;
  }
  // pad `str`!
  return pad + str;
}

/* src\components\Counter.html generated by Svelte v1.55.0 */
function hours(time) {
	return time.getHours();
}

function minutes(time) {
	return time.getMinutes();
}

function seconds(time) {
	return time.getSeconds();
}

function data$1() {
	return {
  count: 0,
  time: new Date()
};
}

function longpress(node, callback) {

  function onmousedown(event) {
    const timeout = setTimeout(() => callback( event ), 500);

    function cancel() {
      clearTimeout(timeout);
      node.removeEventListener('mouseup', cancel, false);
    }

    node.addEventListener('mouseup', cancel, false);
  }

  node.addEventListener('mousedown', onmousedown, false);
  return { teardown: () => node.removeEventListener('mousedown', onmousedown, false) };
}

function pad(num) {
	return leftPad_1(num, 2, '0');
}

var methods$1 = {
  handleClick(event, count) {
    event.preventDefault();
    console.log('the count is', count);
    this.set({ count_old: this.get('count'), count, time: new Date() });
  }
};

function oncreate$1() {
  this.store.observe('width', (newValue, oldValue) => {
    if (!oldValue) return;
    alert(`width=${newValue}`);
  });
}

function ondestroy() {}

function encapsulateStyles$1(node) {
	setAttribute(node, "svelte-1085374804", "");
}

function create_main_fragment$1(state, component) {
	var window_updating = false, clear_window_updating = function() { window_updating = false; }, window_updating_timeout, title_value, text, div, text_1, p, text_2, text_3, text_4, text_5, text_6, button, longpress_handler, text_8, h2, text_9, text_10_value = pad(state.hours), text_10, text_11, text_12_value = pad(state.minutes), text_12, text_13, text_14_value = pad(state.seconds), text_14, text_15, p_1, text_16, text_17_value = state.isBig ? 'BIG' : 'small', text_17, text_18, p_2, text_19, text_20, div_1, text_21, button_1, text_22, text_23, footer, slot_content_default = component._slotted.default, slot_content_default_after, p_3, text_26, button_2, text_28, button_3;

	function onwindowkeydown(event) {
		component.set({ key: event.key, keyCode: event.keyCode });
	}
	window.addEventListener("keydown", onwindowkeydown);

	function onwindowscroll(event) {
		if (window_updating) return;
		window_updating = true;
		component._updatingReadonlyProperty = true;

		component.set({
			y: this.scrollY
		});

		component._updatingReadonlyProperty = false;
		window_updating = false;
	}
	window.addEventListener("scroll", onwindowscroll);

	component.observe("y", function(y) {
		window_updating = true;
		clearTimeout(window_updating_timeout);
		window.scrollTo(window.scrollX, y);
		window_updating_timeout = setTimeout(clear_window_updating, 100);
	});

	document.title = title_value = "" + state.count + " • My App";

	var current_block_type = select_block_type(state);
	var if_block = current_block_type(state, component);

	var current_block_type_1 = select_block_type_1(state);
	var if_block_1 = current_block_type_1(state, component);

	function click_handler(event) {
		var state = component.get();
		component.handleClick(event, state.count + 1);
	}

	function click_handler_1(event) {
		var state = component.get();
		component.store.set({ width: state.Math.random() });
	}

	function click_handler_2(event) {
		component.fire("fakeEvent", { a: 123 });
	}

	function click_handler_3(event) {
		component.fire("click", event);
	}

	return {
		c: function create() {
			text = createText("\r\n\r\n");
			div = createElement("div");
			if_block.c();
			text_1 = createText("\r\n\r\n  ");
			p = createElement("p");
			text_2 = createText("user has scrolled ");
			text_3 = createText(state.y);
			text_4 = createText(" pixels");
			text_5 = createText("\r\n\r\n  ");
			if_block_1.c();
			text_6 = createText("\r\n\r\n  ");
			button = createElement("button");
			button.textContent = "+1";
			text_8 = createText("\r\n\r\n  ");
			h2 = createElement("h2");
			text_9 = createText("Time is ");
			text_10 = createText(text_10_value);
			text_11 = createText(":");
			text_12 = createText(text_12_value);
			text_13 = createText(":");
			text_14 = createText(text_14_value);
			text_15 = createText("\r\n\r\n  ");
			p_1 = createElement("p");
			text_16 = createText("IS ");
			text_17 = createText(text_17_value);
			text_18 = createText("\r\n  ");
			p_2 = createElement("p");
			text_19 = createText(state.foobar);
			text_20 = createText("\r\n\r\n  ");
			div_1 = createElement("div");
			text_21 = createText("Volume=");
			button_1 = createElement("button");
			text_22 = createText(state.$volume);
			text_23 = createText("\r\n\r\n  ");
			footer = createElement("footer");
			if (!slot_content_default) {
				p_3 = createElement("p");
				p_3.textContent = "DEFAULT FOOTER CONTENT";
			}
			text_26 = createText("\r\n    ");
			button_2 = createElement("button");
			button_2.textContent = "FIRE EVENT";
			text_28 = createText("\r\n    ");
			button_3 = createElement("button");
			button_3.textContent = "CLICK EVENT";
			this.h();
		},

		h: function hydrate() {
			encapsulateStyles$1(div);
			encapsulateStyles$1(p);
			encapsulateStyles$1(button);
			addListener(button, "click", click_handler);

			longpress_handler = longpress.call(component, button, function(event) {
				var state = component.get();
				component.handleClick(event, state.count + 10);
			});

			encapsulateStyles$1(p_1);
			encapsulateStyles$1(p_2);
			encapsulateStyles$1(button_1);
			addListener(button_1, "click", click_handler_1);
			encapsulateStyles$1(footer);
			if (!slot_content_default) {
				encapsulateStyles$1(p_3);
			}
			encapsulateStyles$1(button_2);
			addListener(button_2, "click", click_handler_2);
			encapsulateStyles$1(button_3);
			addListener(button_3, "click", click_handler_3);
			div.className = "counter-page";
		},

		m: function mount(target, anchor) {
			insertNode(text, target, anchor);
			insertNode(div, target, anchor);
			if_block.m(div, null);
			appendNode(text_1, div);
			appendNode(p, div);
			appendNode(text_2, p);
			appendNode(text_3, p);
			appendNode(text_4, p);
			appendNode(text_5, div);
			if_block_1.m(div, null);
			appendNode(text_6, div);
			appendNode(button, div);
			appendNode(text_8, div);
			appendNode(h2, div);
			appendNode(text_9, h2);
			appendNode(text_10, h2);
			appendNode(text_11, h2);
			appendNode(text_12, h2);
			appendNode(text_13, h2);
			appendNode(text_14, h2);
			appendNode(text_15, div);
			appendNode(p_1, div);
			appendNode(text_16, p_1);
			appendNode(text_17, p_1);
			appendNode(text_18, div);
			appendNode(p_2, div);
			appendNode(text_19, p_2);
			appendNode(text_20, div);
			appendNode(div_1, div);
			appendNode(text_21, div_1);
			appendNode(button_1, div_1);
			appendNode(text_22, button_1);
			appendNode(text_23, div);
			appendNode(footer, div);
			if (!slot_content_default) {
				appendNode(p_3, footer);
			}

			if (slot_content_default) {
				appendNode(slot_content_default, footer);
				appendNode(slot_content_default_after || (slot_content_default_after = createComment()), footer);
			}

			appendNode(text_26, footer);
			appendNode(button_2, footer);
			appendNode(text_28, footer);
			appendNode(button_3, footer);
		},

		p: function update(changed, state) {
			if ((changed.count) && title_value !== (title_value = "" + state.count + " • My App")) {
				document.title = title_value;
			}

			if (current_block_type === (current_block_type = select_block_type(state)) && if_block) {
				if_block.p(changed, state);
			} else {
				if_block.u();
				if_block.d();
				if_block = current_block_type(state, component);
				if_block.c();
				if_block.m(div, text_1);
			}

			if (changed.y) {
				text_3.data = state.y;
			}

			if (current_block_type_1 === (current_block_type_1 = select_block_type_1(state)) && if_block_1) {
				if_block_1.p(changed, state);
			} else {
				if_block_1.u();
				if_block_1.d();
				if_block_1 = current_block_type_1(state, component);
				if_block_1.c();
				if_block_1.m(div, text_6);
			}

			if ((changed.hours) && text_10_value !== (text_10_value = pad(state.hours))) {
				text_10.data = text_10_value;
			}

			if ((changed.minutes) && text_12_value !== (text_12_value = pad(state.minutes))) {
				text_12.data = text_12_value;
			}

			if ((changed.seconds) && text_14_value !== (text_14_value = pad(state.seconds))) {
				text_14.data = text_14_value;
			}

			if ((changed.isBig) && text_17_value !== (text_17_value = state.isBig ? 'BIG' : 'small')) {
				text_17.data = text_17_value;
			}

			if (changed.foobar) {
				text_19.data = state.foobar;
			}

			if (changed.$volume) {
				text_22.data = state.$volume;
			}
		},

		u: function unmount() {
			detachNode(text);
			detachNode(div);
			if_block.u();
			if_block_1.u();

			if (slot_content_default) {
				reinsertBefore(slot_content_default_after, slot_content_default);
			}
		},

		d: function destroy$$1() {
			window.removeEventListener("keydown", onwindowkeydown);

			window.removeEventListener("scroll", onwindowscroll);

			if_block.d();
			if_block_1.d();
			removeListener(button, "click", click_handler);
			longpress_handler.teardown();
			removeListener(button_1, "click", click_handler_1);
			removeListener(button_2, "click", click_handler_2);
			removeListener(button_3, "click", click_handler_3);
		}
	};
}

// (65:2) {{#if key}}
function create_if_block(state, component) {
	var p, kbd, text_value = state.key === ' ' ? 'Space' : state.key, text, text_1, text_2, text_3;

	return {
		c: function create() {
			p = createElement("p");
			kbd = createElement("kbd");
			text = createText(text_value);
			text_1 = createText(" (code ");
			text_2 = createText(state.keyCode);
			text_3 = createText(")");
			this.h();
		},

		h: function hydrate() {
			encapsulateStyles$1(p);
		},

		m: function mount(target, anchor) {
			insertNode(p, target, anchor);
			appendNode(kbd, p);
			appendNode(text, kbd);
			appendNode(text_1, p);
			appendNode(text_2, p);
			appendNode(text_3, p);
		},

		p: function update(changed, state) {
			if ((changed.key) && text_value !== (text_value = state.key === ' ' ? 'Space' : state.key)) {
				text.data = text_value;
			}

			if (changed.keyCode) {
				text_2.data = state.keyCode;
			}
		},

		u: function unmount() {
			detachNode(p);
		},

		d: noop
	};
}

// (67:2) {{else}}
function create_if_block_1(state, component) {
	var p;

	return {
		c: function create() {
			p = createElement("p");
			p.textContent = "click in this window and press any key";
			this.h();
		},

		h: function hydrate() {
			encapsulateStyles$1(p);
		},

		m: function mount(target, anchor) {
			insertNode(p, target, anchor);
		},

		p: noop,

		u: function unmount() {
			detachNode(p);
		},

		d: noop
	};
}

// (73:2) {{#if count % 10 }}
function create_if_block_2(state, component) {
	var p, text, text_1, text_2, text_3_value = state.count + 1, text_3;

	return {
		c: function create() {
			p = createElement("p");
			text = createText("Count: ");
			text_1 = createText(state.count);
			text_2 = createText(" + 1 = ");
			text_3 = createText(text_3_value);
			this.h();
		},

		h: function hydrate() {
			encapsulateStyles$1(p);
		},

		m: function mount(target, anchor) {
			insertNode(p, target, anchor);
			appendNode(text, p);
			appendNode(text_1, p);
			appendNode(text_2, p);
			appendNode(text_3, p);
		},

		p: function update(changed, state) {
			if (changed.count) {
				text_1.data = state.count;
			}

			if ((changed.count) && text_3_value !== (text_3_value = state.count + 1)) {
				text_3.data = text_3_value;
			}
		},

		u: function unmount() {
			detachNode(p);
		},

		d: noop
	};
}

// (75:2) {{else}}
function create_if_block_3(state, component) {
	var p;

	return {
		c: function create() {
			p = createElement("p");
			p.textContent = "MOD 10 == 0 !";
			this.h();
		},

		h: function hydrate() {
			encapsulateStyles$1(p);
		},

		m: function mount(target, anchor) {
			insertNode(p, target, anchor);
		},

		p: noop,

		u: function unmount() {
			detachNode(p);
		},

		d: noop
	};
}

function select_block_type(state) {
	if (state.key) return create_if_block;
	return create_if_block_1;
}

function select_block_type_1(state) {
	if (state.count % 10) return create_if_block_2;
	return create_if_block_3;
}

function Counter(options) {
	this._debugName = '<Counter>';
	if (!options || (!options.target && !options.root)) throw new Error("'target' is a required option");
	init(this, options);
	this._state = assign({ Math : Math }, this.store._init(["volume"]), data$1(), options.data);
	this.store._add(this, ["volume"]);
	this._state.y = window.scrollY;
	this._recompute({ time: 1 }, this._state);
	if (!('time' in this._state)) console.warn("<Counter> was created without expected data property 'time'");
	if (!('y' in this._state)) console.warn("<Counter> was created without expected data property 'y'");
	if (!('count' in this._state)) console.warn("<Counter> was created without expected data property 'count'");
	if (!('key' in this._state)) console.warn("<Counter> was created without expected data property 'key'");
	if (!('keyCode' in this._state)) console.warn("<Counter> was created without expected data property 'keyCode'");
	if (!('hours' in this._state)) console.warn("<Counter> was created without expected data property 'hours'");
	if (!('minutes' in this._state)) console.warn("<Counter> was created without expected data property 'minutes'");
	if (!('seconds' in this._state)) console.warn("<Counter> was created without expected data property 'seconds'");
	if (!('isBig' in this._state)) console.warn("<Counter> was created without expected data property 'isBig'");
	if (!('foobar' in this._state)) console.warn("<Counter> was created without expected data property 'foobar'");
	if (!('Math' in this._state)) console.warn("<Counter> was created without expected data property 'Math'");
	if (!('$volume' in this._state)) console.warn("<Counter> was created without expected data property '$volume'");

	this._handlers.destroy = [ondestroy, removeFromStore];

	this._slotted = options.slots || {};

	var _oncreate = oncreate$1.bind(this);

	if (!options.root) {
		this._oncreate = [];
	}

	this.slots = {};

	this._fragment = create_main_fragment$1(this._state, this);

	this.root._oncreate.push(_oncreate);

	if (options.target) {
		if (options.hydrate) throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		this._fragment.c();
		this._fragment.m(options.target, options.anchor || null);

		callAll(this._oncreate);
	}
}

assign(Counter.prototype, methods$1, protoDev);

Counter.prototype._checkReadOnly = function _checkReadOnly(newState) {
	if ('hours' in newState && !this._updatingReadonlyProperty) throw new Error("<Counter>: Cannot set read-only property 'hours'");
	if ('minutes' in newState && !this._updatingReadonlyProperty) throw new Error("<Counter>: Cannot set read-only property 'minutes'");
	if ('seconds' in newState && !this._updatingReadonlyProperty) throw new Error("<Counter>: Cannot set read-only property 'seconds'");
};

Counter.prototype._recompute = function _recompute(changed, state) {
	if (changed.time) {
		if (this._differs(state.hours, (state.hours = hours(state.time)))) changed.hours = true;
		if (this._differs(state.minutes, (state.minutes = minutes(state.time)))) changed.minutes = true;
		if (this._differs(state.seconds, (state.seconds = seconds(state.time)))) changed.seconds = true;
	}
};

/* src\components\App.html generated by Svelte v1.55.0 */
function data() {
	return {
  foobar: 'foobarValue'
};
}

var methods = {
  alertPopup(event) {
    alert(JSON.stringify(event));
    alert(this.get('name'));
    alert(this.constructor.const1);
  }
};

function oncreate() {
  const canvas = this.refs.canvas;
  const ctx = canvas.getContext('2d');
}

function setup(constructor) {
  constructor.const1 = 'CONST1VALUE';
}

function encapsulateStyles(node) {
	setAttribute(node, "svelte-3900708595", "");
}

function create_main_fragment(state, component) {
	var canvas, text, h1, text_1, span, text_2, text_3, text_4, text_5, text_6, input, input_updating = false, text_7, ul, text_8, await_block_1, await_block_type, await_token, promise, resolved, text_9, text_10, hr, text_11, hr_1, text_12;

	function input_input_handler() {
		input_updating = true;
		component.set({ name: input.value });
		input_updating = false;
	}

	var games = state.games;

	var each_blocks = [];

	for (var i = 0; i < games.length; i += 1) {
		each_blocks[i] = create_each_block(state, games, games[i], i, component);
	}

	function replace_await_block(token, type, value, state) {
		if (token !== await_token) return;

		var old_block = await_block_1;
		await_block_1 = (await_block_type = type)(state, resolved = value, component);

		if (old_block) {
			old_block.u();
			old_block.d();
			await_block_1.c();
			await_block_1.m(text_9.parentNode, text_9);

			component.root.set({});
		}
	}

	function handle_promise(promise, state) {
		var token = await_token = {};

		if (isPromise(promise)) {
			promise.then(function(value) {
				var state = component.get();
				replace_await_block(token, create_then_block, value, state);
			}, function (error) {
				var state = component.get();
				replace_await_block(token, create_catch_block, error, state);
			});

			// if we previously had a then/catch block, destroy it
			if (await_block_type !== create_pending_block) {
				replace_await_block(token, create_pending_block, null, state);
				return true;
			}
		} else {
			resolved = promise;
			if (await_block_type !== create_then_block) {
				replace_await_block(token, create_then_block, resolved, state);
				return true;
			}
		}
	}

	handle_promise(promise = state.promise, state);

	var counter = new Counter({
		root: component.root,
		slots: { default: createFragment() },
		data: { isBig: true, foobar: state.foobar }
	});

	counter.on("fakeEvent", function(event) {
		component.alertPopup(event);
	});
	counter.on("click", function(event) {
		component.alertPopup(event);
	});

	return {
		c: function create() {
			canvas = createElement("canvas");
			text = createText("\r\n\r\n");
			h1 = createElement("h1");
			text_1 = createText("Hello, ");
			span = createElement("span");
			text_2 = createText(state.name);
			text_3 = createText(". (store: name=");
			text_4 = createText(state.$name);
			text_5 = createText(")");
			text_6 = createText("\r\n");
			input = createElement("input");
			text_7 = createText("\r\n\r\n");
			ul = createElement("ul");

			for (var i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			text_8 = createText("\r\n\r\n");

			await_block_1.c();

			text_9 = createText("\r\n\r\n");
			text_10 = createText("\r\n  ");
			hr = createElement("hr");
			text_11 = createText("\r\n  FOOTER SLOT\r\n  ");
			hr_1 = createElement("hr");
			text_12 = createText("\r\n");
			counter._fragment.c();
			this.h();
		},

		h: function hydrate() {
			canvas.width = "200";
			canvas.height = "100";
			encapsulateStyles(h1);
			encapsulateStyles(span);
			span.className = "logo-font";
			addListener(input, "input", input_input_handler);
			input.placeholder = "enter your name";
		},

		m: function mount(target, anchor) {
			insertNode(canvas, target, anchor);
			component.refs.canvas = canvas;
			insertNode(text, target, anchor);
			insertNode(h1, target, anchor);
			appendNode(text_1, h1);
			appendNode(span, h1);
			appendNode(text_2, span);
			appendNode(text_3, h1);
			appendNode(text_4, h1);
			appendNode(text_5, h1);
			insertNode(text_6, target, anchor);
			insertNode(input, target, anchor);

			input.value = state.name;

			insertNode(text_7, target, anchor);
			insertNode(ul, target, anchor);

			for (var i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].i(ul, null);
			}

			insertNode(text_8, target, anchor);

			await_block_1.m(target, anchor);

			insertNode(text_9, target, anchor);
			appendNode(text_10, counter._slotted.default);
			appendNode(hr, counter._slotted.default);
			appendNode(text_11, counter._slotted.default);
			appendNode(hr_1, counter._slotted.default);
			appendNode(text_12, counter._slotted.default);
			counter._mount(target, anchor);
		},

		p: function update(changed, state) {
			if (changed.name) {
				text_2.data = state.name;
			}

			if (changed.$name) {
				text_4.data = state.$name;
			}

			if (!input_updating) input.value = state.name;

			var games = state.games;

			if (changed.games) {
				for (var i = 0; i < games.length; i += 1) {
					if (each_blocks[i]) {
						each_blocks[i].p(changed, state, games, games[i], i);
					} else {
						each_blocks[i] = create_each_block(state, games, games[i], i, component);
						each_blocks[i].c();
					}
					each_blocks[i].i(ul, null);
				}

				function outro(i) {
					if (each_blocks[i]) {
						each_blocks[i].o(function() {
							each_blocks[i].u();
							each_blocks[i].d();
							each_blocks[i] = null;
						});
					}
				}

				for (; i < each_blocks.length; i += 1) outro(i);
			}

			if (('promise' in changed) && promise !== (promise = state.promise) && handle_promise(promise, state)) {
				// nothing
			} else {
				await_block_1.p(changed, state, resolved);
			}

			var counter_changes = {};
			if (changed.foobar) counter_changes.foobar = state.foobar;
			counter._set(counter_changes);
		},

		u: function unmount() {
			detachNode(canvas);
			detachNode(text);
			detachNode(h1);
			detachNode(text_6);
			detachNode(input);
			detachNode(text_7);
			detachNode(ul);

			for (var i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].u();
			}

			detachNode(text_8);

			await_block_1.u();

			detachNode(text_9);
			counter._unmount();
		},

		d: function destroy$$1() {
			if (component.refs.canvas === canvas) component.refs.canvas = null;
			removeListener(input, "input", input_input_handler);

			destroyEach(each_blocks);

			await_token = null;
			await_block_1.d();

			counter.destroy(false);
		}
	};
}

// (36:2) {{#each games as game, i}}
function create_each_block(state, games, game, i, component) {
	var li, text, text_1_value = i + 1, text_1, text_2, text_3_value = game, text_3, li_intro, li_outro, introing, outroing;

	return {
		c: function create() {
			li = createElement("li");
			text = createText("#");
			text_1 = createText(text_1_value);
			text_2 = createText(" ");
			text_3 = createText(text_3_value);
			this.h();
		},

		h: function hydrate() {
			encapsulateStyles(li);
			setAttribute(li, "svelte-ref-gameItem", "");
		},

		m: function mount(target, anchor) {
			insertNode(li, target, anchor);
			appendNode(text, li);
			appendNode(text_1, li);
			appendNode(text_2, li);
			appendNode(text_3, li);
			component.refs.gameItem = li;
		},

		p: function update(changed, state, games, game, i) {
			if ((outroing || changed.games) && text_3_value !== (text_3_value = game)) {
				text_3.data = text_3_value;
			}
		},

		i: function intro(target, anchor) {
			if (introing) return;
			introing = true;
			outroing = false;

			if (li_intro) li_intro.abort();
			if (li_outro) li_outro.abort();

			component.root._aftercreate.push(function() {
				li_intro = wrapTransition(component, li, fly, {y: 50}, true, null);
				li_intro.run(true, function() {
					component.fire("intro.end", { node: li });
				});
			});

			this.m(target, anchor);
		},

		o: function outro(outrocallback) {
			if (outroing) return;
			outroing = true;
			introing = false;

			var outros = 1;

			li_outro = wrapTransition(component, li, fade, {}, false, null);
			li_outro.run(false, function() {
				component.fire("outro.end", { node: li });
				if (--outros === 0) outrocallback();
			});
		},

		u: function unmount() {
			detachNode(li);
		},

		d: function destroy$$1() {
			if (component.refs.gameItem === li) component.refs.gameItem = null;
		}
	};
}

// (41:18)     <p>wait for it...</p>  {{then answer}}
function create_pending_block(state, _, component) {
	var p;

	return {
		c: function create() {
			p = createElement("p");
			p.textContent = "wait for it...";
		},

		m: function mount(target, anchor) {
			insertNode(p, target, anchor);
		},

		p: noop,

		u: function unmount() {
			detachNode(p);
		},

		d: noop
	};
}

// (43:0) {{then answer}}
function create_then_block(state, answer, component) {
	var p, text, text_1_value = answer, text_1, text_2;

	return {
		c: function create() {
			p = createElement("p");
			text = createText("the answer is ");
			text_1 = createText(text_1_value);
			text_2 = createText("!");
		},

		m: function mount(target, anchor) {
			insertNode(p, target, anchor);
			appendNode(text, p);
			appendNode(text_1, p);
			appendNode(text_2, p);
		},

		p: function update(changed, state, answer) {
			if ((changed.promise) && text_1_value !== (text_1_value = answer)) {
				text_1.data = text_1_value;
			}
		},

		u: function unmount() {
			detachNode(p);
		},

		d: noop
	};
}

// (45:0) {{catch err}}
function create_catch_block(state, err, component) {
	var p, text, text_1_value = err.message, text_1;

	return {
		c: function create() {
			p = createElement("p");
			text = createText("well that's odd: ");
			text_1 = createText(text_1_value);
		},

		m: function mount(target, anchor) {
			insertNode(p, target, anchor);
			appendNode(text, p);
			appendNode(text_1, p);
		},

		p: function update(changed, state, err) {
			if ((changed.promise) && text_1_value !== (text_1_value = err.message)) {
				text_1.data = text_1_value;
			}
		},

		u: function unmount() {
			detachNode(p);
		},

		d: noop
	};
}

function App(options) {
	this._debugName = '<App>';
	if (!options || (!options.target && !options.root)) throw new Error("'target' is a required option");
	init(this, options);
	this.refs = {};
	this._state = assign(this.store._init(["name"]), data(), options.data);
	this.store._add(this, ["name"]);
	if (!('name' in this._state)) console.warn("<App> was created without expected data property 'name'");
	if (!('$name' in this._state)) console.warn("<App> was created without expected data property '$name'");
	if (!('games' in this._state)) console.warn("<App> was created without expected data property 'games'");
	if (!('promise' in this._state)) console.warn("<App> was created without expected data property 'promise'");
	if (!('foobar' in this._state)) console.warn("<App> was created without expected data property 'foobar'");

	this._handlers.destroy = [removeFromStore];

	var _oncreate = oncreate.bind(this);

	if (!options.root) {
		this._oncreate = [];
		this._beforecreate = [];
		this._aftercreate = [];
	}

	this._fragment = create_main_fragment(this._state, this);

	this.root._oncreate.push(_oncreate);

	if (options.target) {
		if (options.hydrate) throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		this._fragment.c();
		this._fragment.m(options.target, options.anchor || null);

		this._lock = true;
		callAll(this._beforecreate);
		callAll(this._oncreate);
		callAll(this._aftercreate);
		this._lock = false;
	}
}

assign(App.prototype, methods, protoDev);

App.prototype._checkReadOnly = function _checkReadOnly(newState) {
};

setup(App);

function Store(state, options) {
	this._observers = { pre: blankObject(), post: blankObject() };
	this._changeHandlers = [];
	this._dependents = [];

	this._computed = blankObject();
	this._sortedComputedProperties = [];

	this._state = assign({}, state);
	this._differs = options && options.immutable ? _differsImmutable : _differs;
}

assign(Store.prototype, {
	_add: function(component, props) {
		this._dependents.push({
			component: component,
			props: props
		});
	},

	_init: function(props) {
		var state = {};
		for (var i = 0; i < props.length; i += 1) {
			var prop = props[i];
			state['$' + prop] = this._state[prop];
		}
		return state;
	},

	_remove: function(component) {
		var i = this._dependents.length;
		while (i--) {
			if (this._dependents[i].component === component) {
				this._dependents.splice(i, 1);
				return;
			}
		}
	},

	_sortComputedProperties: function() {
		var computed = this._computed;
		var sorted = this._sortedComputedProperties = [];
		var cycles;
		var visited = blankObject();

		function visit(key) {
			if (cycles[key]) {
				throw new Error('Cyclical dependency detected');
			}

			if (visited[key]) return;
			visited[key] = true;

			var c = computed[key];

			if (c) {
				cycles[key] = true;
				c.deps.forEach(visit);
				sorted.push(c);
			}
		}

		for (var key in this._computed) {
			cycles = blankObject();
			visit(key);
		}
	},

	compute: function(key, deps, fn) {
		var store = this;
		var value;

		var c = {
			deps: deps,
			update: function(state, changed, dirty) {
				var values = deps.map(function(dep) {
					if (dep in changed) dirty = true;
					return state[dep];
				});

				if (dirty) {
					var newValue = fn.apply(null, values);
					if (store._differs(newValue, value)) {
						value = newValue;
						changed[key] = true;
						state[key] = value;
					}
				}
			}
		};

		c.update(this._state, {}, true);

		this._computed[key] = c;
		this._sortComputedProperties();
	},

	get: get,

	observe: observe,

	onchange: function(callback) {
		this._changeHandlers.push(callback);
		return {
			cancel: function() {
				var index = this._changeHandlers.indexOf(callback);
				if (~index) this._changeHandlers.splice(index, 1);
			}
		};
	},

	set: function(newState) {
		var oldState = this._state,
			changed = this._changed = {},
			dirty = false;

		for (var key in newState) {
			if (this._computed[key]) throw new Error("'" + key + "' is a read-only property");
			if (this._differs(newState[key], oldState[key])) changed[key] = dirty = true;
		}
		if (!dirty) return;

		this._state = assign({}, oldState, newState);

		for (var i = 0; i < this._sortedComputedProperties.length; i += 1) {
			this._sortedComputedProperties[i].update(this._state, changed);
		}

		for (var i = 0; i < this._changeHandlers.length; i += 1) {
			this._changeHandlers[i](this._state, changed);
		}

		dispatchObservers(this, this._observers.pre, changed, this._state, oldState);

		var dependents = this._dependents.slice(); // guard against mutations
		for (var i = 0; i < dependents.length; i += 1) {
			var dependent = dependents[i];
			var componentState = {};
			dirty = false;

			for (var j = 0; j < dependent.props.length; j += 1) {
				var prop = dependent.props[j];
				if (prop in changed) {
					componentState['$' + prop] = this._state[prop];
					dirty = true;
				}
			}

			if (dirty) dependent.component.set(componentState);
		}

		dispatchObservers(this, this._observers.post, changed, this._state, oldState);
	}
});

const store = new Store({
  name: 'world!',
  width: 10,
  height: 10,
  depth: 10
});
store.compute(
  'volume',
  ['width', 'height', 'depth'],
  (width, height, depth) => width * height * depth
);
store.onchange((state, changed) => {
  console.log(`These properties changed: ${Object.keys(changed).join(', ')}`, state);
});

/*
function useLocalStorage(store, key) {
  const json = localStorage.getItem(key);
  if (json) {
    store.set(JSON.parse(json)); // this almost works, except complains that "volume" is read-only
  }
  store.onchange(state => {
    localStorage.setItem(key, JSON.stringify(state));
  });
}
useLocalStorage(store, 'my-svelte-key');
*/

var index = new App({
  target: document.body,
  store,
  data: {
    name: 'steve',
    games: ['hockey', 'volleyball'],
    promise: new Promise(r => {
      setTimeout(() => r(42), 3000);
    })
  }
});

return index;

}());
//# sourceMappingURL=bundle.js.map
