-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "professor_tour_completed_at" TIMESTAMP(3),
ADD COLUMN     "director_tour_completed_at" TIMESTAMP(3),
ADD COLUMN     "dean_tour_completed_at" TIMESTAMP(3);
