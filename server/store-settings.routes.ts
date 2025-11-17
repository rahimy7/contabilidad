import { Router } from 'express';
import { storeSettings } from '../shared/schema';
import { eq } from 'drizzle-orm';
import { authenticateToken } from './authMiddleware';
import { supabase } from './supabase-client';
import { getTenantDb } from './multi-tenant-db';

const router = Router();

// ✅ GET store settings
router.get('/store-settings', authenticateToken, async (req, res) => {
  try {
    const storeId = (req as any).user?.storeId || 1;
    const tenantDb = await getTenantDb(storeId);

    let settings = await tenantDb
      .select()
      .from(storeSettings)
      .where(eq(storeSettings.storeId, storeId))
      .limit(1);

    // ✅ If no settings exist, create default ones
    if (!settings.length) {
      const defaultSettings = {
        storeId,
        storeName: 'Mi Tienda',
        storeAddress: '',
        storePhone: '',
        storeEmail: '',
        storeWhatsAppNumber: '',
        invoiceFooter: 'Gracias por su compra',
        invoiceNumber: 1,
        currency: 'DOP',
        taxPercentage: 18,
        businessHours: '09:00-18:00',
        logoUrl: null,
        logoStoragePath: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await tenantDb.insert(storeSettings).values(defaultSettings);
      settings = await tenantDb
        .select()
        .from(storeSettings)
        .where(eq(storeSettings.storeId, storeId))
        .limit(1);
    }

    res.json(settings[0]);
  } catch (error) {
    console.error('Error fetching store settings:', error);
    res.status(500).json({ error: 'Failed to fetch store settings' });
  }
});

// ✅ UPDATE store settings
router.put('/store-settings', authenticateToken, async (req, res) => {
  try {
    const storeId = (req as any).user?.storeId || 1;
    const tenantDb = await getTenantDb(storeId);
    const {
      storeName,
      storeAddress,
      storePhone,
      storeEmail,
      storeWhatsAppNumber,
      invoiceFooter,
      invoiceNumber,
      currency,
      taxPercentage,
      businessHours,
      logoUrl,
      logoStoragePath,
    } = req.body;

    const result = await tenantDb
      .update(storeSettings)
      .set({
        storeName: storeName || undefined,
        storeAddress: storeAddress || undefined,
        storePhone: storePhone || undefined,
        storeEmail: storeEmail || undefined,
        storeWhatsAppNumber: storeWhatsAppNumber || undefined,
        invoiceFooter: invoiceFooter || undefined,
        invoiceNumber: invoiceNumber || undefined,
        currency: currency || undefined,
        taxPercentage: taxPercentage ? parseFloat(taxPercentage) : undefined,
        businessHours: businessHours || undefined,
        logoUrl: logoUrl || undefined,
        logoStoragePath: logoStoragePath || undefined,
        updatedAt: new Date(),
      })
      .where(eq(storeSettings.storeId, storeId))
      .returning();

    if (!result.length) {
      return res.status(404).json({ error: 'Store settings not found' });
    }

    res.json(result[0]);
  } catch (error) {
    console.error('Error updating store settings:', error);
    res.status(500).json({ error: 'Failed to update store settings' });
  }
});

// ✅ UPLOAD store logo to Supabase
router.post('/store-settings/upload-logo', authenticateToken, async (req, res) => {
  try {
    const storeId = (req as any).user?.storeId || 1;
    const { file, filename } = req.body;

    if (!file || !filename) {
      return res.status(400).json({ error: 'File and filename are required' });
    }

    // Decode base64 file
    const buffer = Buffer.from(file, 'base64');
    const storagePath = `store-${storeId}/logo/${filename}`;

    // Upload to Supabase
    const { data, error } = await supabase.storage
      .from('store-files')
      .upload(storagePath, buffer, {
        cacheControl: '3600',
        upsert: true,
        contentType: 'image/png',
      });

    if (error) {
      console.error('Supabase upload error:', error);
      return res.status(500).json({ error: 'Failed to upload logo' });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('store-files')
      .getPublicUrl(storagePath);

    const logoUrl = urlData?.publicUrl;

    // Update store settings with new logo
    const tenantDb = await getTenantDb(storeId);
    await tenantDb
      .update(storeSettings)
      .set({
        logoUrl,
        logoStoragePath: storagePath,
        updatedAt: new Date(),
      })
      .where(eq(storeSettings.storeId, storeId));

    res.json({
      success: true,
      logoUrl,
      storagePath,
    });
  } catch (error) {
    console.error('Error uploading logo:', error);
    res.status(500).json({ error: 'Failed to upload logo' });
  }
});

// ✅ DELETE store logo from Supabase
router.delete('/store-settings/logo', authenticateToken, async (req, res) => {
  try {
    const storeId = (req as any).user?.storeId || 1;
    const tenantDb = await getTenantDb(storeId);

    // Get current logo path
    const current = await tenantDb
      .select()
      .from(storeSettings)
      .where(eq(storeSettings.storeId, storeId))
      .limit(1);

    if (current[0]?.logoStoragePath) {
      // Delete from Supabase
      await supabase.storage
        .from('store-files')
        .remove([current[0].logoStoragePath]);
    }

    // Clear logo from settings
    await tenantDb
      .update(storeSettings)
      .set({
        logoUrl: null,
        logoStoragePath: null,
        updatedAt: new Date(),
      })
      .where(eq(storeSettings.storeId, storeId));

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting logo:', error);
    res.status(500).json({ error: 'Failed to delete logo' });
  }
});

export default router;
