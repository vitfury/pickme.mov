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
ALTER TYPE "public"."award_category_type" ADD VALUE IF NOT EXISTS 'short_animated';
