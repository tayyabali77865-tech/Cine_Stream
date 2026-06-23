const dns = require('dns').promises;

async function resolve() {
  try {
    const srvRecord = '_mongodb._tcp.cluster0.mbreua3.mongodb.net';
    console.log(`Resolving SRV records for: ${srvRecord}`);
    dns.setServers(['8.8.8.8', '1.1.1.1']);
    
    const addresses = await dns.resolveSrv(srvRecord);
    console.log('\nDirect Shard Node Hosts found:');
    addresses.forEach(addr => {
      console.log(`- ${addr.name}:${addr.port}`);
    });

    const hostList = addresses.map(addr => `${addr.name}:${addr.port}`).join(',');
    const standardUri = `mongodb://ia51862561_db_user:Tayyabali7890@${hostList}/cinestream?ssl=true&replicaSet=atlas-mbreua-shard-0&authSource=admin&retryWrites=true&w=majority`;
    
    console.log('\nStandard Connection URI (non-SRV):');
    console.log(standardUri);
  } catch (err) {
    console.error('Resolution failed:', err);
  }
}

resolve();
