export class BaseCollector {
  /**
   * Execute collection for target URL.
   * @param {string} url - Target URL
   * @param {object} [kwargs] - Additional arguments
   * @returns {Promise<string>} Cleaned content or HTML
   */
  async collect(url, kwargs) {
    throw new Error("Method 'collect()' must be implemented.");
  }
}
