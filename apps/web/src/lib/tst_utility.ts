
/* 
  TST Utility Strategy: "The Fuel & Shield Model"

  This file serves as the strict implementation guide for TST utility.
  It is referenced by the Fee Engine, P2P Module, and Reward System.
*/

export const TST_CONFIG = {
  // 1. FEE DISCOUNTS (Standard Utility)
  // Pay fees with TST = 25% discount
  FEE_DISCOUNT_ENABLED: true,
  FEE_DISCOUNT_PERCENT: 0.25,
  
  // 2. MERCHANT SHIELD (Access Gating)
  // To post P2P Ads, user must "stake" (lock) TST.
  // This prevents spam and creates a "sink" (funds removed from circulation while active).
  P2P_MAKER_MIN_STAKE: "500.00", // 500 TST required to be a Maker
  
  // 3. COPY TRADING FUEL (Performance Utility)
  // Copy trading takes a 10% profit fee. 
  // If holding > 1000 TST, fee is reduced to 8%.
  COPY_TRADING_TIER_1_THRESHOLD: "1000.00",
  COPY_TRADING_FEE_DISCOUNT: 0.02, // 2% reduction
};

// Database Migration Requirements to support this:
// 1. app_user.pay_fees_with_tst (boolean)
// 2. ex_ledger_account for TST (already supported)
// 3. p2p_ad creation check -> locking TST

export function calculateFee(
  baseFee: bigint, 
  userHasTstEnabled: boolean, 
  tstBalance: bigint,
  tstPrice: bigint // price in Quote asset
): { finalFee: bigint, paidInTst: boolean, tstCost: bigint } {
  // Logic implementation placeholder
  if (userHasTstEnabled && tstBalance > 0n) {
     // ... logic to convert fee to TST and apply discount
  }
  return { finalFee: baseFee, paidInTst: false, tstCost: 0n };
}
