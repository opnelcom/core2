(function (root) {
  "use strict";
  const defaults = { USD: "$", GBP: "£", EUR: "€", ZAR: "R" };
  function settings(currency = {}) {
    return { symbol: defaults[currency.currency_code] || currency.currency_code || "", symbol_position: "before", thousands_separator: ",", decimal_separator: ".", ...currency.format_json, decimal_places: currency.decimal_places ?? 2 };
  }
  function validate(format, decimals) {
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 2) return "Decimal places must be a whole number from 0 to 2";
    if (!format || typeof format !== "object" || Array.isArray(format)) return "Currency format must be an object";
    if (typeof format.symbol !== "string" || format.symbol.length > 12 || /[0-9\r\n<>]/.test(format.symbol)) return "Currency symbol must contain at most 12 characters without digits or markup";
    if (!["before", "after"].includes(format.symbol_position)) return "Choose a valid currency symbol position";
    if (![",", ".", " ", ""].includes(format.thousands_separator)) return "Choose a valid thousands separator";
    if (![".", ","].includes(format.decimal_separator) || format.decimal_separator === format.thousands_separator) return "Decimal and thousands separators must be different";
    return null;
  }
  function format(value, currency, symbol = true) {
    const config = settings(currency);
    const exact = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value));
    let negative, parts;
    if (exact) {
      const scale = config.decimal_places;
      const fraction = (exact[3] || "").padEnd(scale, "0");
      let magnitude = BigInt(exact[2]) * (10n ** BigInt(scale)) + BigInt(fraction.slice(0, scale) || "0");
      if (fraction.length > scale && fraction[scale] >= "5") magnitude += 1n;
      const digits = magnitude.toString().padStart(scale + 1, "0");
      parts = scale ? [digits.slice(0, -scale), digits.slice(-scale)] : [digits];
      negative = exact[1] === "-";
    } else {
      const number = Number(value);
      if (!Number.isFinite(number)) return "";
      parts = Math.abs(number).toFixed(config.decimal_places).split(".");
      negative = number < 0;
    }
    if (config.thousands_separator) parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, config.thousands_separator);
    let text = parts.join(config.decimal_separator);
    if (symbol && config.symbol) text = config.symbol_position === "after" ? `${text} ${config.symbol}` : `${config.symbol} ${text}`;
    return `${negative ? "-" : ""}${text}`;
  }
  function parse(value, currency) {
    const config = settings(currency);
    let text = String(value ?? "").trim();
    if (!text) return 0;
    let negative = false;
    if (text.startsWith("-")) { negative = true; text = text.slice(1).trim(); }
    if (config.symbol) {
      if (config.symbol_position === "before" && text.startsWith(config.symbol)) text = text.slice(config.symbol.length).trim();
      else if (config.symbol_position === "after" && text.endsWith(config.symbol)) text = text.slice(0, -config.symbol.length).trim();
    }
    const parts = text.split(config.decimal_separator);
    if (parts.length > 2 || !parts[0] || (parts.length === 2 && (!/^\d+$/.test(parts[1]) || parts[1].length > config.decimal_places))) return NaN;
    let integer = parts[0];
    if (config.thousands_separator && integer.includes(config.thousands_separator)) {
      const groups = integer.split(config.thousands_separator);
      if (!/^\d{1,3}$/.test(groups[0]) || groups.slice(1).some((group) => !/^\d{3}$/.test(group))) return NaN;
      integer = groups.join("");
    }
    if (!/^\d+$/.test(integer)) return NaN;
    const number = Number(`${integer}${parts.length === 2 ? `.${parts[1]}` : ""}`);
    return negative ? -number : number;
  }
  const api = { settings, validate, format, parse };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CurrencyFormat = api;
})(typeof globalThis === "object" ? globalThis : this);
