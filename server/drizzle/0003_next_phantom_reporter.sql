-- Expand award_category_type enum to all 23 Academy Award categories
ALTER TYPE "public"."award_category_type" ADD VALUE IF NOT EXISTS 'editing';
ALTER TYPE "public"."award_category_type" ADD VALUE IF NOT EXISTS 'production_design';
ALTER TYPE "public"."award_category_type" ADD VALUE IF NOT EXISTS 'costume_design';
ALTER TYPE "public"."award_category_type" ADD VALUE IF NOT EXISTS 'makeup';
ALTER TYPE "public"."award_category_type" ADD VALUE IF NOT EXISTS 'sound';
ALTER TYPE "public"."award_category_type" ADD VALUE IF NOT EXISTS 'visual_effects';
ALTER TYPE "public"."award_category_type" ADD VALUE IF NOT EXISTS 'original_screenplay';
ALTER TYPE "public"."award_category_type" ADD VALUE IF NOT EXISTS 'adapted_screenplay';
ALTER TYPE "public"."award_category_type" ADD VALUE IF NOT EXISTS 'documentary_feature';
ALTER TYPE "public"."award_category_type" ADD VALUE IF NOT EXISTS 'documentary_short';
ALTER TYPE "public"."award_category_type" ADD VALUE IF NOT EXISTS 'short_live_action';
ALTER TYPE "public"."award_category_type" ADD VALUE IF NOT EXISTS 'short_animated';--> statement-breakpoint

-- Reclassify grouped categories into proper splits
UPDATE awards SET category = 'editing' WHERE category = 'other' AND category_detail ILIKE '%EDITING%';--> statement-breakpoint
UPDATE awards SET category = 'production_design' WHERE category = 'other' AND (category_detail ILIKE '%ART DIRECTION%' OR category_detail ILIKE '%PRODUCTION DESIGN%');--> statement-breakpoint
UPDATE awards SET category = 'costume_design' WHERE category = 'other' AND category_detail ILIKE '%COSTUME%';--> statement-breakpoint
UPDATE awards SET category = 'makeup' WHERE category = 'other' AND (category_detail ILIKE '%MAKEUP%' OR category_detail ILIKE '%HAIRSTYLING%');--> statement-breakpoint
UPDATE awards SET category = 'sound' WHERE category = 'other' AND (category_detail ILIKE '%SOUND%' OR category_detail ILIKE '%SPECIAL ACHIEVEMENT%SOUND%');--> statement-breakpoint
UPDATE awards SET category = 'visual_effects' WHERE category = 'other' AND (category_detail ILIKE '%VISUAL EFFECTS%' OR category_detail ILIKE '%SPECIAL ACHIEVEMENT%VISUAL%');--> statement-breakpoint
UPDATE awards SET category = 'original_screenplay' WHERE category = 'screenplay' AND category_detail ILIKE '%Original%';--> statement-breakpoint
UPDATE awards SET category = 'adapted_screenplay' WHERE category = 'screenplay' AND category_detail ILIKE '%Adapted%';--> statement-breakpoint
UPDATE awards SET category = 'documentary_feature' WHERE category = 'other' AND category_detail ILIKE '%DOCUMENTARY%Feature%';--> statement-breakpoint
UPDATE awards SET category = 'documentary_short' WHERE category = 'other' AND category_detail ILIKE '%DOCUMENTARY%Short%';--> statement-breakpoint
UPDATE awards SET category = 'short_live_action' WHERE category = 'other' AND category_detail ILIKE '%SHORT FILM%Live Action%';--> statement-breakpoint
UPDATE awards SET category = 'short_animated' WHERE category = 'other' AND category_detail ILIKE '%SHORT FILM%Animated%';--> statement-breakpoint

-- Remove uncategorizable leftovers (Casting, generic Special Achievement)
DELETE FROM awards WHERE category = 'other';
