import { useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import ImageWithLightbox from '@/components/ImageWithLightbox'
import { TImetaInfo } from '@/types'

interface ImageCarouselProps {
  images: TImetaInfo[]
  className?: string
}

export default function ImageCarousel({ images, className = '' }: ImageCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)

  if (!images || images.length === 0) {
    return null
  }

  const goToPrevious = () => {
    setCurrentIndex((prevIndex) => 
      prevIndex === 0 ? images.length - 1 : prevIndex - 1
    )
  }

  const goToNext = () => {
    setCurrentIndex((prevIndex) => 
      prevIndex === images.length - 1 ? 0 : prevIndex + 1
    )
  }

  const openFullscreen = () => {
    setIsFullscreen(true)
  }

  const closeFullscreen = () => {
    setIsFullscreen(false)
  }

  const currentImage = images[currentIndex]

  return (
    <>
      <div className={`relative ${className}`}>
        {/* Thumbnail grid */}
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
          {images.map((image, index) => (
            <div
              key={index}
              className={`aspect-square rounded-lg overflow-hidden cursor-pointer transition-all duration-200 ${
                index === currentIndex 
                  ? 'ring-2 ring-blue-500 ring-offset-2' 
                  : 'hover:opacity-80'
              }`}
              onClick={() => setCurrentIndex(index)}
            >
              {image.m?.startsWith('video/') ? (
                <video
                  src={image.url}
                  className="w-full h-full object-cover"
                  controls
                  preload="metadata"
                />
              ) : (
                <ImageWithLightbox
                  image={image}
                  className="w-full h-full object-cover"
                  classNames={{
                    wrapper: 'w-full h-full'
                  }}
                />
              )}
            </div>
          ))}
        </div>

        {/* Main image display */}
        {images.length > 0 && (
          <div className="mt-4 relative">
            <div className="relative rounded-lg overflow-hidden bg-muted">
              {currentImage.m?.startsWith('video/') ? (
                <video
                  src={currentImage.url}
                  className="w-full max-w-[800px] h-auto object-contain mx-auto"
                  controls
                  preload="metadata"
                  onClick={openFullscreen}
                />
              ) : (
                <div onClick={openFullscreen} className="cursor-pointer">
                  <ImageWithLightbox
                    image={currentImage}
                    className="w-full max-w-[800px] h-auto object-contain mx-auto"
                  />
                </div>
              )}
              
              {/* Navigation arrows */}
              {images.length > 1 && (
                <>
                  <button
                    onClick={goToPrevious}
                    className="absolute left-2 top-1/2 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-colors"
                    aria-label="Previous image"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={goToNext}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-colors"
                    aria-label="Next image"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}

              {/* Image counter */}
              {images.length > 1 && (
                <div className="absolute bottom-2 right-2 bg-black/50 text-white text-sm px-2 py-1 rounded">
                  {currentIndex + 1} / {images.length}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Fullscreen modal */}
      {isFullscreen && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
          <button
            onClick={closeFullscreen}
            className="absolute top-4 right-4 text-white hover:text-gray-300 z-10"
            aria-label="Close fullscreen"
          >
            <X className="w-8 h-8" />
          </button>
          
          <div className="relative max-w-full max-h-full">
            {currentImage.m?.startsWith('video/') ? (
              <video
                src={currentImage.url}
                className="max-w-full max-h-full object-contain"
                controls
                autoPlay
                preload="metadata"
              />
            ) : (
              <ImageWithLightbox
                image={currentImage}
                className="max-w-full max-h-full object-contain"
              />
            )}
            
            {/* Fullscreen navigation */}
            {images.length > 1 && (
              <>
                <button
                  onClick={goToPrevious}
                  className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-3 transition-colors"
                  aria-label="Previous image"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button
                  onClick={goToNext}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-3 transition-colors"
                  aria-label="Next image"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
                
                {/* Fullscreen counter */}
                <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/50 text-white text-lg px-4 py-2 rounded">
                  {currentIndex + 1} / {images.length}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
