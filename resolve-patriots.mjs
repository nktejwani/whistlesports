// Quick script to resolve the Patriots bet as a loss
// Direct database update method

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const dbPath = join(process.cwd(), 'data', 'db.json');

try {
  // Read database
  const db = JSON.parse(readFileSync(dbPath, 'utf-8'));
  
  // Find the Patriots bet
  const betId = 'kiki2-1770562291971';
  const bet = db.bets.find(b => b.id === betId);
  
  if (!bet) {
    console.log('❌ Bet not found');
    process.exit(1);
  }
  
  console.log('📋 Before:', {
    selection: bet.selection,
    outcome: bet.outcome,
    stake: bet.stake
  });
  
  // Resolve as loss
  bet.outcome = 'loss';
  bet.resolvedAt = new Date().toISOString();
  bet.payout = 0;
  
  // Note: User already lost tokens when bet was placed,
  // so no need to deduct again on loss
  
  // Write back to database
  writeFileSync(dbPath, JSON.stringify(db, null, 2));
  
  console.log('✅ Bet resolved as LOSS');
  console.log('📋 After:', {
    selection: bet.selection,
    outcome: bet.outcome,
    payout: bet.payout,
    resolvedAt: bet.resolvedAt
  });
  console.log('\n🔄 Refresh your app to see the update!');
  
} catch (error) {
  console.error('❌ Error:', error.message);
}
