/**
 * Vision LLM — image description via DashScope multimodal API.
 */
export interface VisionResult {
    success: boolean;
    text: string;
}
/**
 * Describe an image using a vision-capable LLM.
 * @param imageUrl - HTTP URL or data URL of the image
 */
export declare function describeImage(imageUrl: string): Promise<VisionResult>;
