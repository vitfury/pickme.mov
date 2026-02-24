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
