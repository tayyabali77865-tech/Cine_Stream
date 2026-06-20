export default function handler(req, res) {
  res.setHeader('Content-Type', 'text/javascript');
  res.status(200).send('/* Blocked Script Placeholder */');
}
