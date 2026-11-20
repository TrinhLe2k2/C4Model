/*
 * Add-on for opening this export with file://. Not part of the publisher source.
 * No original source asset is overwritten.
 * - Supplies local all-page search data to the publisher's search script.
 * - Provides interaction fallbacks only if the external theme script is absent.
 * - Leaves the publisher's ad script URL and footer markup unchanged.
 */
(function () {
  'use strict';
  var node = document.getElementById('c4-local-search-data');
  var raw = window.C4_LOCAL_SEARCH_DATA || {};
  var root = new URL('../', node ? node.src : document.currentScript.src);
  var data = {};
  Object.keys(raw).forEach(function (key) {
    var entry = Object.assign({}, raw[key]);
    entry.url = new URL(entry.url, root).href;
    entry.relUrl = entry.url;
    data[key] = entry;
  });
  var serialized = JSON.stringify(data);
  var NativeXHR = window.XMLHttpRequest;
  var state = { exportedPage: document.title, indexedSections: Object.keys(data).length, localSearchOnly: true, themeStylesheetAvailable: false };
  window.C4_FILE_STATUS = state;

  class LocalSearchXHR extends NativeXHR {
    open(method, url) {
      var address = String(url);
      this._c4Search = String(method).toUpperCase() === 'GET' && /(?:^|\/)assets\/js\/search-data\.json(?:[?#].*)?$/.test(address);
      this._c4Aborted = false;
      if (this._c4Search) {
        this._c4URL = address;
        this._c4Async = arguments.length < 3 || arguments[2] !== false;
        return;
      }
      return super.open(...arguments);
    }
    setRequestHeader() {
      if (!this._c4Search) return super.setRequestHeader(...arguments);
    }
    getResponseHeader(name) {
      if (!this._c4Search) return super.getResponseHeader(name);
      return String(name).toLowerCase() === 'content-type' ? 'application/json; charset=utf-8' : null;
    }
    getAllResponseHeaders() {
      return this._c4Search ? 'Content-Type: application/json; charset=utf-8\r\n' : super.getAllResponseHeaders();
    }
    send() {
      if (!this._c4Search) return super.send(...arguments);
      var request = this;
      function complete() {
        if (request._c4Aborted) return;
        Object.defineProperties(request, {
          status: { configurable: true, value: 200 },
          statusText: { configurable: true, value: 'OK' },
          readyState: { configurable: true, value: 4 },
          responseText: { configurable: true, value: serialized },
          response: { configurable: true, value: request.responseType === 'json' ? data : serialized },
          responseURL: { configurable: true, value: new URL(request._c4URL, document.baseURI).href }
        });
        request.dispatchEvent(new Event('readystatechange'));
        request.dispatchEvent(new Event('load'));
        request.dispatchEvent(new Event('loadend'));
      }
      if (this._c4Async) setTimeout(complete, 0);
      else complete();
    }
    abort() {
      if (this._c4Search) { this._c4Aborted = true; return; }
      return super.abort();
    }
  }
  window.XMLHttpRequest = LocalSearchXHR;

  // The publisher's remotely loaded implementation replaces this no-op when available.
  // This avoids a ReferenceError when the original external ad resource is unavailable.
  if (typeof window.showAd !== 'function') window.showAd = function () {};

  function ready() {
    var theme = document.getElementById('c4-original-theme');
    state.themeStylesheetAvailable = Boolean(theme && theme.sheet);
    state.publisherScriptAvailable = Boolean(window.jtd);
    if (window.jtd) return;

    var menuButton = document.getElementById('menu-button');
    var nav = document.getElementById('site-nav');
    var header = document.getElementById('main-header');
    if (menuButton && nav) {
      menuButton.addEventListener('click', function () {
        var open = !nav.classList.contains('nav-open');
        nav.classList.toggle('nav-open', open);
        if (header) header.classList.toggle('nav-open', open);
        menuButton.setAttribute('aria-pressed', String(open));
      });
    }
    document.querySelectorAll('.nav-list-expander').forEach(function (button) {
      button.addEventListener('click', function () {
        var expanded = button.getAttribute('aria-expanded') !== 'true';
        button.setAttribute('aria-expanded', String(expanded));
        button.parentElement.classList.toggle('active', expanded);
      });
    });

    var input = document.getElementById('search-input');
    var results = document.getElementById('search-results');
    if (!input || !results) return;
    function close() { document.documentElement.classList.remove('search-active'); }
    function render() {
      var query = input.value.toLowerCase().trim();
      results.replaceChildren();
      if (!query) { close(); return; }
      document.documentElement.classList.add('search-active');
      var list = document.createElement('ul');
      list.className = 'search-results-list';
      Object.values(data).filter(function (entry) {
        return (entry.doc + ' ' + entry.title + ' ' + entry.content).toLowerCase().includes(query);
      }).forEach(function (entry) {
        var li = document.createElement('li');
        li.className = 'search-results-list-item';
        var a = document.createElement('a');
        a.className = 'search-result';
        a.href = entry.url;
        var title = document.createElement('div');
        title.className = 'search-result-title';
        title.textContent = entry.doc === entry.title ? entry.title : entry.doc + ' — ' + entry.title;
        var preview = document.createElement('div');
        preview.className = 'search-result-preview';
        var offset = Math.max(0, entry.content.toLowerCase().indexOf(query) - 50);
        preview.textContent = entry.content.slice(offset, offset + 180);
        a.append(title, preview);
        a.addEventListener('click', close);
        li.append(a);
        list.append(li);
      });
      results.append(list);
    }
    input.addEventListener('input', render);
    input.addEventListener('focus', function () { if (input.value.trim()) render(); });
    document.addEventListener('keydown', function (event) { if (event.key === 'Escape') close(); });
    var overlay = document.querySelector('.search-overlay');
    if (overlay) overlay.addEventListener('click', close);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
}());
