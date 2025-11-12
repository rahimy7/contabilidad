# AI Credits - Tenant-Aware Storage Integration

## Problem Identified

The application was getting stuck when checking AI credits. The logs showed:

```
❌ [TENANT-STORAGE] Error obteniendo créditos para tienda 6: 
error: column "auto_recharge" does not exist
```

### Root Cause

The `getAICredits()` method was trying to select columns that don't exist in the database yet:
- `auto_recharge`
- `recharge_threshold`
- `recharge_amount`
- `fallback_when_no_credits`
- `notify_low_credits`
- `low_credit_threshold`
- `total_messages_processed`
- `total_orders_created`
- `total_voice_notes_transcribed`

## Changes Made

### 1. Updated AI Credits Query (tenant-storage.ts)
**File**: `server/tenant-storage.ts`
**Lines**: 4402-4461

- Modified `getAICredits()` to select only core columns that exist in the database
- Added error handling with fallback to raw SQL query
- Gracefully handles schema mismatches

**Selected Columns (Guaranteed to exist)**:
- `id`
- `store_id`
- `total_credits`
- `used_credits`
- `available_credits`
- `is_enabled`
- `cost_per_message`
- `cost_per_order`
- `cost_per_voice_note`

### 2. Made AI Credits Manager Tenant-Aware
**File**: `server/ai-credits-manager.ts`
**Lines**: 20-35, 389-398

- Added optional `tenantStorage` parameter to `AICreditsManager.hasCredits()`
- Updated `shouldUseAI()` to accept and pass `tenantStorage`
- Ensures credits are queried from tenant-specific schema (e.g., `store_6.ai_credits`)

### 3. Updated WhatsApp Smart AI Integration
**File**: `server/whatsapp-smart-ai.ts`
**Lines**: 111-135, 142

- Modified calls to `shouldUseAI()` to pass `tenantStorage`
- Modified calls to `AICreditsManager.hasCredits()` to pass `tenantStorage`

### 4. Added Interface Definitions
**File**: `server/interfaces/storage.ts`
**Lines**: 293-304, 600-612

Added missing method signatures:
- `MasterStorage.getAICredits(storeId: number)`
- `MasterStorage.updateAICredits(storeId: number, data: any)`
- `TenantStorage.getAICredits()`
- `TenantStorage.logAIUsage(entry: any)`
- `TenantStorage.getAIUsageStats(days?: number)`
- `TenantStorage.getAIConversation(conversationId: number)`
- `TenantStorage.createAIConversation(data: any)`
- `TenantStorage.updateAIConversation(conversationId: number, updates: any)`

## Key Improvements

✅ **Multi-Tenant Support**: Credits are now queried from the correct store schema
✅ **Database Compatibility**: Handles missing columns gracefully with fallback mechanism
✅ **Type Safety**: Added proper interface definitions for TypeScript
✅ **Error Handling**: Comprehensive logging and fallback mechanisms

## Testing

To test the fix with a curl command:

```bash
curl -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "id": "ENTRY_ID",
      "changes": [{
        "value": {
          "messaging_product": "whatsapp",
          "metadata": {
            "display_phone_number": "15551234567",
            "phone_number_id": "YOUR_PHONE_NUMBER_ID"
          },
          "contacts": [{
            "profile": {"name": "Test User"},
            "wa_id": "18097572575"
          }],
          "messages": [{
            "from": "18097572575",
            "id": "wamid.test123",
            "timestamp": "1668888504",
            "text": {"body": "Un renuvó"},
            "type": "text"
          }]
        },
        "field": "messages"
      }]
    }]
  }'
```

## Next Steps

1. Run database migration to add missing columns (if needed)
2. Test the AI credits flow end-to-end
3. Monitor logs for any remaining issues

## Commits

- `99cd61c`: Fix: Handle missing database columns in AI credits query
- `bdf3fa3`: Fix: Update AI credits verification to use tenant-aware storage
