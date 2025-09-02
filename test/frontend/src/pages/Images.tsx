import React, { useState, useRef } from 'react';
import { useDocker } from '../contexts/DockerContext';
import * as api from '../services/api';
import toast from 'react-hot-toast';
import {
  TrashIcon,
  ArrowPathIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  MagnifyingGlassIcon,
  TagIcon,
  DocumentDuplicateIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline';

const Images: React.FC = () => {
  const { images, refreshImages } = useDocker();
  const [loading, setLoading] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [showPullModal, setShowPullModal] = useState(false);
  const [pullImageName, setPullImageName] = useState('');
  const [pullTag, setPullTag] = useState('latest');
  const [showTagModal, setShowTagModal] = useState(false);
  const [tagImageId, setTagImageId] = useState('');
  const [newRepository, setNewRepository] = useState('');
  const [newTag, setNewTag] = useState('');
  const [showBuildModal, setShowBuildModal] = useState(false);
  const [dockerfileContent, setDockerfileContent] = useState('');
  const [buildTag, setBuildTag] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredImages = images.filter(image =>
    image.tags.some(tag => tag.toLowerCase().includes(filter.toLowerCase())) ||
    image.id.toLowerCase().includes(filter.toLowerCase())
  );

  const formatSize = (bytes: number): string => {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const handlePullImage = async () => {
    if (!pullImageName) return;

    const imageName = `${pullImageName}:${pullTag}`;
    setLoading('pull');
    setShowPullModal(false);

    try {
      await api.pullImage(imageName);
      toast.success(`Successfully pulled ${imageName}`);
      await refreshImages();
    } catch (error: any) {
      toast.error(`Failed to pull image: ${error.message}`);
    } finally {
      setLoading(null);
      setPullImageName('');
      setPullTag('latest');
    }
  };

  const handleRemoveImage = async (id: string, tags: string[]) => {
    const displayName = tags.length > 0 ? tags[0] : id.substring(0, 12);
    if (!confirm(`Are you sure you want to remove image "${displayName}"?`)) return;

    setLoading(id);
    try {
      await api.removeImage(id, false);
      toast.success('Image removed');
      await refreshImages();
    } catch (error: any) {
      if (error.response?.status === 409) {
        if (confirm('Image is in use. Force remove?')) {
          await api.removeImage(id, true);
          toast.success('Image force removed');
          await refreshImages();
        }
      } else {
        toast.error(`Failed to remove image: ${error.message}`);
      }
    } finally {
      setLoading(null);
    }
  };

  const handleTagImage = async () => {
    if (!tagImageId || !newRepository) return;

    setLoading(tagImageId);
    setShowTagModal(false);

    try {
      await api.tagImage(tagImageId, newRepository, newTag || 'latest');
      toast.success(`Tagged image as ${newRepository}:${newTag || 'latest'}`);
      await refreshImages();
    } catch (error: any) {
      toast.error(`Failed to tag image: ${error.message}`);
    } finally {
      setLoading(null);
      setTagImageId('');
      setNewRepository('');
      setNewTag('');
    }
  };

  const handleExportImage = async (id: string, tags: string[]) => {
    const displayName = tags.length > 0 ? tags[0] : id.substring(0, 12);
    setLoading(id);

    try {
      const response = await api.exportImage(id);
      const blob = new Blob([response.data], { type: 'application/x-tar' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${displayName.replace(/[:/]/g, '_')}.tar`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${displayName}`);
    } catch (error: any) {
      toast.error(`Failed to export image: ${error.message}`);
    } finally {
      setLoading(null);
    }
  };

  const handleImportImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('tarball', file);

    setLoading('import');
    try {
      await api.importImage(formData);
      toast.success('Image imported successfully');
      await refreshImages();
    } catch (error: any) {
      toast.error(`Failed to import image: ${error.message}`);
    } finally {
      setLoading(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleBuildImage = async () => {
    if (!dockerfileContent || !buildTag) return;

    setLoading('build');
    setShowBuildModal(false);

    try {
      await api.buildImage({
        dockerfile: dockerfileContent,
        tag: buildTag,
        buildArgs: {}
      });
      toast.success(`Successfully built ${buildTag}`);
      await refreshImages();
    } catch (error: any) {
      toast.error(`Failed to build image: ${error.message}`);
    } finally {
      setLoading(null);
      setDockerfileContent('');
      setBuildTag('');
    }
  };

  const toggleImageSelection = (imageId: string) => {
    const newSelection = new Set(selectedImages);
    if (newSelection.has(imageId)) {
      newSelection.delete(imageId);
    } else {
      newSelection.add(imageId);
    }
    setSelectedImages(newSelection);
  };

  const removeSelectedImages = async () => {
    if (!confirm(`Remove ${selectedImages.size} selected image(s)?`)) return;

    setLoading('bulk-remove');
    let removed = 0;
    let failed = 0;

    for (const imageId of selectedImages) {
      try {
        await api.removeImage(imageId, false);
        removed++;
      } catch (error) {
        failed++;
      }
    }

    toast.success(`Removed ${removed} image(s)${failed > 0 ? `, ${failed} failed` : ''}`);
    setSelectedImages(new Set());
    await refreshImages();
    setLoading(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Images</h1>
        <div className="flex items-center space-x-4">
          <div className="relative">
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search images..."
              className="input pl-10 w-64"
            />
            <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          </div>

          <button
            onClick={refreshImages}
            className="btn-secondary"
            disabled={loading !== null}
          >
            <ArrowPathIcon className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {selectedImages.size > 0 && (
            <button
              onClick={removeSelectedImages}
              className="btn-danger"
            >
              Remove Selected ({selectedImages.size})
            </button>
          )}

          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn-secondary"
          >
            <ArrowUpTrayIcon className="w-5 h-5 mr-2" />
            Import
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".tar"
            onChange={handleImportImage}
            className="hidden"
          />

          <button
            onClick={() => setShowBuildModal(true)}
            className="btn-secondary"
          >
            Build
          </button>

          <button
            onClick={() => setShowPullModal(true)}
            className="btn-primary"
          >
            <ArrowDownTrayIcon className="w-5 h-5 mr-2" />
            Pull Image
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-6 py-3 text-left">
                <input
                  type="checkbox"
                  checked={selectedImages.size === images.length && images.length > 0}
                  onChange={() => {
                    if (selectedImages.size === images.length) {
                      setSelectedImages(new Set());
                    } else {
                      setSelectedImages(new Set(images.map(img => img.id)));
                    }
                  }}
                  className="rounded"
                />
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Repository
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Tag
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Image ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Created
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Size
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {filteredImages.map((image) => {
              const primaryTag = image.tags.length > 0 ? image.tags[0] : '<none>';
              const [repository, tag] = primaryTag.includes(':') 
                ? primaryTag.split(':') 
                : [primaryTag, '<none>'];

              return (
                <tr key={image.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-6 py-4">
                    <input
                      type="checkbox"
                      checked={selectedImages.has(image.id)}
                      onChange={() => toggleImageSelection(image.id)}
                      className="rounded"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {repository}
                    </div>
                    {image.tags.length > 1 && (
                      <div className="text-xs text-gray-500">
                        +{image.tags.length - 1} more tag{image.tags.length > 2 ? 's' : ''}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 py-1 text-xs rounded bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                      {tag}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <code className="text-xs text-gray-600 dark:text-gray-400">
                      {image.id.replace('sha256:', '').substring(0, 12)}
                    </code>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                    {formatDate(image.created)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                    {formatSize(image.size)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        onClick={() => {
                          setTagImageId(image.id);
                          setShowTagModal(true);
                        }}
                        className="text-blue-600 hover:text-blue-700"
                        title="Tag Image"
                        disabled={loading === image.id}
                      >
                        <TagIcon className="w-5 h-5" />
                      </button>

                      <button
                        onClick={() => handleExportImage(image.id, image.tags)}
                        className="text-green-600 hover:text-green-700"
                        title="Export Image"
                        disabled={loading === image.id}
                      >
                        <ArrowDownTrayIcon className="w-5 h-5" />
                      </button>

                      <button
                        onClick={() => handleRemoveImage(image.id, image.tags)}
                        className="text-red-600 hover:text-red-700"
                        title="Remove Image"
                        disabled={loading === image.id}
                      >
                        <TrashIcon className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filteredImages.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400">
              {filter ? 'No images found matching your search' : 'No images found'}
            </p>
          </div>
        )}
      </div>

      {/* Pull Image Modal */}
      {showPullModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Pull Image</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Image Name</label>
                <input
                  type="text"
                  value={pullImageName}
                  onChange={(e) => setPullImageName(e.target.value)}
                  placeholder="e.g., nginx, ubuntu, node"
                  className="input w-full"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Tag</label>
                <input
                  type="text"
                  value={pullTag}
                  onChange={(e) => setPullTag(e.target.value)}
                  placeholder="latest"
                  className="input w-full"
                />
              </div>
              <div className="flex justify-end space-x-2">
                <button
                  onClick={() => setShowPullModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePullImage}
                  className="btn-primary"
                  disabled={!pullImageName}
                >
                  Pull
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tag Image Modal */}
      {showTagModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Tag Image</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Repository</label>
                <input
                  type="text"
                  value={newRepository}
                  onChange={(e) => setNewRepository(e.target.value)}
                  placeholder="e.g., myapp, registry.example.com/myapp"
                  className="input w-full"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Tag</label>
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="latest"
                  className="input w-full"
                />
              </div>
              <div className="flex justify-end space-x-2">
                <button
                  onClick={() => {
                    setShowTagModal(false);
                    setTagImageId('');
                    setNewRepository('');
                    setNewTag('');
                  }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleTagImage}
                  className="btn-primary"
                  disabled={!newRepository}
                >
                  Tag
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Build Image Modal */}
      {showBuildModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Build Image</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Image Tag</label>
                <input
                  type="text"
                  value={buildTag}
                  onChange={(e) => setBuildTag(e.target.value)}
                  placeholder="e.g., myapp:latest"
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Dockerfile Content</label>
                <textarea
                  value={dockerfileContent}
                  onChange={(e) => setDockerfileContent(e.target.value)}
                  placeholder={`FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "start"]`}
                  className="input w-full h-64 font-mono text-sm"
                />
              </div>
              <div className="flex justify-end space-x-2">
                <button
                  onClick={() => {
                    setShowBuildModal(false);
                    setDockerfileContent('');
                    setBuildTag('');
                  }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBuildImage}
                  className="btn-primary"
                  disabled={!dockerfileContent || !buildTag}
                >
                  Build
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Images;