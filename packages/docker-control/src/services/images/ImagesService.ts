import Docker from 'dockerode';
import { Readable } from 'stream';
import debug from 'debug';
import { DockerClient } from '../../engine/DockerClient';
import { RealtimeEmitter } from '../../realtime/RealtimeEmitter';
import { 
  ImageInfo, 
  ImagePullOptions, 
  ImagePullOptionsSchema,
  ImagePullProgress,
  ImageTag,
  ImageTagSchema
} from '../../models/image';
import { handleDockerodeError, NotFoundError, ConflictError } from '../../errors/DockerErrors';
import { RetryHelper } from '../../utils/retry';
import { StreamHelper } from '../../utils/stream';

const log = debug('docker-control:images');

export interface ImageListOptions {
  all?: boolean;
  filters?: {
    dangling?: boolean;
    label?: string[];
    before?: string;
    since?: string;
    reference?: string[];
  };
  digests?: boolean;
}

export interface ImageRemoveOptions {
  force?: boolean;
  noprune?: boolean;
}

export interface ImagePruneOptions {
  dangling?: boolean;
  until?: string;
  label?: string[];
}

export class ImagesService {
  private docker: Docker;
  private client: DockerClient;
  private realtime: RealtimeEmitter;

  constructor(client: DockerClient, realtime: RealtimeEmitter) {
    this.client = client;
    this.docker = client.getDockerInstance();
    this.realtime = realtime;
  }

  async list(options?: ImageListOptions): Promise<ImageInfo[]> {
    try {
      const dockerOptions: any = {
        all: options?.all,
        digests: options?.digests
      };

      if (options?.filters) {
        dockerOptions.filters = JSON.stringify(options.filters);
      }

      const images = await this.docker.listImages(dockerOptions);
      
      return images.map(this.mapImageInfo);
    } catch (error) {
      throw handleDockerodeError(error);
    }
  }

  async pull(imageName: string, options?: ImagePullOptions): Promise<void> {
    try {
      const validatedOptions = options ? ImagePullOptionsSchema.parse(options) : undefined;
      const fullImageName = `${imageName}:${validatedOptions?.tag || 'latest'}`;
      
      log(`Pulling image: ${fullImageName}`);

      const authconfig = validatedOptions?.auth ? {
        username: validatedOptions.auth.username,
        password: validatedOptions.auth.password,
        serveraddress: validatedOptions.auth.serveraddress,
        email: validatedOptions.auth.email
      } : undefined;

      const stream = await this.docker.pull(fullImageName, { authconfig });
      
      await this.handlePullStream(stream, fullImageName);
      
      log(`Image pulled successfully: ${fullImageName}`);
    } catch (error) {
      throw handleDockerodeError(error);
    }
  }

  private async handlePullStream(stream: NodeJS.ReadableStream, imageName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const layers: Map<string, ImagePullProgress> = new Map();
      
      this.docker.modem.followProgress(
        stream,
        (err: Error | null, output: any[]) => {
          if (err) {
            reject(handleDockerodeError(err));
          } else {
            resolve();
          }
        },
        (event: any) => {
          const progress: ImagePullProgress = {
            id: event.id || 'unknown',
            status: event.status,
            progress: event.progress,
            progressDetail: event.progressDetail,
            error: event.error
          };

          if (progress.id !== 'unknown') {
            layers.set(progress.id, progress);
          }

          this.realtime.emitRealtimeEvent({
            type: 'image.pull',
            timestamp: new Date(),
            imageId: imageName,
            data: {
              progress,
              layers: Array.from(layers.values())
            }
          });

          if (event.error) {
            reject(new Error(event.error));
          }
        }
      );
    });
  }

  async inspect(imageId: string): Promise<Docker.ImageInspectInfo> {
    try {
      const image = this.docker.getImage(imageId);
      const info = await image.inspect();
      return info;
    } catch (error: any) {
      if (error.statusCode === 404) {
        throw new NotFoundError('Image', imageId);
      }
      throw handleDockerodeError(error);
    }
  }

  async tag(imageId: string, options: ImageTag): Promise<void> {
    try {
      const validatedOptions = ImageTagSchema.parse(options);
      const image = this.docker.getImage(imageId);
      
      await image.tag({
        repo: validatedOptions.repo,
        tag: validatedOptions.tag
      });

      log(`Image tagged: ${imageId} -> ${validatedOptions.repo}:${validatedOptions.tag}`);
    } catch (error: any) {
      if (error.statusCode === 404) {
        throw new NotFoundError('Image', imageId);
      }
      throw handleDockerodeError(error);
    }
  }

  async remove(imageId: string, options?: ImageRemoveOptions): Promise<void> {
    try {
      const image = this.docker.getImage(imageId);
      
      await image.remove({
        force: options?.force,
        noprune: options?.noprune
      });

      this.realtime.emitRealtimeEvent({
        type: 'image.remove',
        timestamp: new Date(),
        imageId,
        data: { removed: true }
      });

      log(`Image removed: ${imageId}`);
    } catch (error: any) {
      if (error.statusCode === 404) {
        throw new NotFoundError('Image', imageId);
      }
      if (error.statusCode === 409) {
        throw new ConflictError('Image is being used by a container');
      }
      throw handleDockerodeError(error);
    }
  }

  async push(imageName: string, options?: { tag?: string; auth?: any }): Promise<void> {
    try {
      const image = this.docker.getImage(`${imageName}:${options?.tag || 'latest'}`);
      
      const stream = await image.push({
        authconfig: options?.auth
      });

      await this.handlePushStream(stream, imageName);
      
      log(`Image pushed successfully: ${imageName}`);
    } catch (error: any) {
      if (error.statusCode === 404) {
        throw new NotFoundError('Image', imageName);
      }
      throw handleDockerodeError(error);
    }
  }

  private async handlePushStream(stream: NodeJS.ReadableStream, imageName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.docker.modem.followProgress(
        stream,
        (err: Error | null) => {
          if (err) {
            reject(handleDockerodeError(err));
          } else {
            resolve();
          }
        },
        (event: any) => {
          this.realtime.emitRealtimeEvent({
            type: 'image.push',
            timestamp: new Date(),
            imageId: imageName,
            data: {
              status: event.status,
              progress: event.progress,
              error: event.error
            }
          });

          if (event.error) {
            reject(new Error(event.error));
          }
        }
      );
    });
  }

  async history(imageId: string): Promise<any[]> {
    try {
      const image = this.docker.getImage(imageId);
      const history = await image.history();
      return history;
    } catch (error: any) {
      if (error.statusCode === 404) {
        throw new NotFoundError('Image', imageId);
      }
      throw handleDockerodeError(error);
    }
  }

  async prune(options?: ImagePruneOptions): Promise<{ ImagesDeleted: string[]; SpaceReclaimed: number }> {
    try {
      const filters: any = {};
      
      if (options?.dangling !== undefined) {
        filters.dangling = [options.dangling.toString()];
      }
      if (options?.until) {
        filters.until = [options.until];
      }
      if (options?.label) {
        filters.label = options.label;
      }

      const result = await this.docker.pruneImages({ 
        filters: Object.keys(filters).length > 0 ? JSON.stringify(filters) : undefined 
      });
      
      log(`Pruned images: ${result.ImagesDeleted?.length || 0} removed, ${result.SpaceReclaimed || 0} bytes reclaimed`);
      
      return {
        ImagesDeleted: result.ImagesDeleted?.map((img: any) => img.Deleted || img.Untagged).filter(Boolean) || [],
        SpaceReclaimed: result.SpaceReclaimed || 0
      };
    } catch (error) {
      throw handleDockerodeError(error);
    }
  }

  async search(term: string, options?: { limit?: number; filters?: any }): Promise<any[]> {
    try {
      const searchOptions: any = {
        term,
        limit: options?.limit
      };

      if (options?.filters) {
        searchOptions.filters = JSON.stringify(options.filters);
      }

      const results = await this.docker.searchImages(searchOptions);
      return results;
    } catch (error) {
      throw handleDockerodeError(error);
    }
  }

  async export(imageId: string): Promise<NodeJS.ReadableStream> {
    try {
      const image = this.docker.getImage(imageId);
      const stream = await image.get();
      return stream;
    } catch (error: any) {
      if (error.statusCode === 404) {
        throw new NotFoundError('Image', imageId);
      }
      throw handleDockerodeError(error);
    }
  }

  async import(stream: NodeJS.ReadableStream, options?: { repo?: string; tag?: string; message?: string }): Promise<void> {
    try {
      await this.docker.loadImage(stream);
      log(`Image imported successfully`);
    } catch (error) {
      throw handleDockerodeError(error);
    }
  }

  private mapImageInfo(image: Docker.ImageInfo): ImageInfo {
    return {
      id: image.Id,
      parentId: image.ParentId || '',
      repoTags: image.RepoTags || [],
      repoDigests: image.RepoDigests || [],
      created: new Date(image.Created * 1000),
      size: image.Size || 0,
      virtualSize: image.VirtualSize || 0,
      sharedSize: image.SharedSize || 0,
      labels: image.Labels || {},
      containers: image.Containers || 0,
      architecture: (image as any).Architecture || '',
      os: (image as any).Os || '',
      author: (image as any).Author,
      comment: (image as any).Comment
    };
  }
}