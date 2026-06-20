import scrapeHandler from '../scrape';

export default async function handler(req, res) {
  // Proxies directly to the robust scraper handler with retries and logging
  return scrapeHandler(req, res);
}
