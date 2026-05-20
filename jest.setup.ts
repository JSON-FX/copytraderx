import "@testing-library/jest-dom";

// Radix UI calls scrollIntoView on DOM elements, which jsdom doesn't implement.
if (!window.Element.prototype.scrollIntoView) {
  window.Element.prototype.scrollIntoView = jest.fn();
}
if (!window.Element.prototype.hasPointerCapture) {
  window.Element.prototype.hasPointerCapture = jest.fn(() => false);
}
if (!window.Element.prototype.setPointerCapture) {
  window.Element.prototype.setPointerCapture = jest.fn();
}
if (!window.Element.prototype.releasePointerCapture) {
  window.Element.prototype.releasePointerCapture = jest.fn();
}
