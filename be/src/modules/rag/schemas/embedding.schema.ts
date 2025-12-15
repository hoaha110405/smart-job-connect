import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Schema as MongooseSchema } from "mongoose";

export type EmbeddingDocument = Embedding & Document;

@Schema({ timestamps: true })
export class Embedding {
  @Prop({ required: true, index: true })
  sourceType: string; // 'cv' | 'job' | 'pdf'

  @Prop({ required: true, index: true })
  sourceId: string; // cv._id.toString()

  @Prop({ required: true })
  chunkIndex: number;

  /**
   * text: previously required — now optional so empty CVs can be indexed.
   */
  @Prop({ type: String, default: "" })
  text: string; // allow empty string

  /**
   * embedding: now optional, allow empty array for CVs with no content.
   */
  @Prop({ type: [Number], default: [] })
  embedding: number[]; // allow empty embedding array

  /**
   * metadata: unchanged
   */
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata: Record<string, any>;
}

export const EmbeddingSchema = SchemaFactory.createForClass(Embedding);

EmbeddingSchema.index(
  { sourceType: 1, sourceId: 1, chunkIndex: 1 },
  { unique: true },
);
