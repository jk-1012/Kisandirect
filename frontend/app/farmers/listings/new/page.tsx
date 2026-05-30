'use client';

import React, { useState, useRef } from 'react';
import { Camera, Upload, Mic, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function NewListingPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [step, setStep] = useState<'PHOTO' | 'AI_PROCESSING' | 'DETAILS'>('PHOTO');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  
  const [aiData, setAiData] = useState<any>(null);
  const [formData, setFormData] = useState({
    crop_type: '',
    crop_category: '',
    quantity_kg: '',
    asking_price_per_kg_inr: '',
    harvest_date: new Date().toISOString().split('T')[0],
    organic: false,
    delivery_available: false,
    description: ''
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      alert('Camera access denied or unavailable. You can also upload a photo.');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        canvas.toBlob((blob) => {
          if (blob) {
            setPhotoBlob(blob);
            setPhotoUrl(URL.createObjectURL(blob));
            stopCamera();
            processImage(blob);
          }
        }, 'image/jpeg', 0.8);
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setPhotoBlob(file);
      setPhotoUrl(URL.createObjectURL(file));
      stopCamera();
      processImage(file);
    }
  };

  const processImage = async (blob: Blob) => {
    setStep('AI_PROCESSING');
    try {
      // Step 1: Get presigned URL
      const urlRes = await fetch(`http://localhost:4000/api/v1/listings/photo/upload-url?filename=crop.jpg&content_type=image/jpeg`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!urlRes.ok) throw new Error('Failed to get upload URL');
      const { uploadUrl, s3Key } = await urlRes.json();

      // Step 2: Upload to S3
      await fetch(uploadUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': 'image/jpeg' } });

      // Step 3: Trigger Vision AI Processing
      const processRes = await fetch('http://localhost:4000/api/v1/listings/photo/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ s3Key })
      });
      
      const result = await processRes.json();
      setAiData({ ...result, s3Key });
      
      if (result.aiDetectedCrop) {
        setFormData(prev => ({
          ...prev,
          crop_type: result.aiDetectedCrop,
          crop_category: result.aiCategory || 'VEGETABLES'
        }));
      }
      
      setStep('DETAILS');
    } catch (error) {
      console.error(error);
      alert('Photo processing failed. Please enter details manually.');
      setStep('DETAILS');
    }
  };

  const handleVoiceInput = () => {
    alert('Mock Bhashini Voice Input: Recognizing voice...');
    setTimeout(() => {
      setFormData(prev => ({ ...prev, description: '[HI] मेरे खेत के ताज़ा टमाटर, बहुत अच्छी क्वालिटी। (My farm fresh tomatoes, very good quality.)' }));
    }, 1500);
  };

  const submitListing = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const payload = {
        ...formData,
        quantity_kg: Number(formData.quantity_kg),
        asking_price_per_kg_inr: Number(formData.asking_price_per_kg_inr),
        photo_s3_keys: aiData?.s3Key ? [aiData.s3Key] : []
      };

      const res = await fetch('http://localhost:4000/api/v1/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}`, 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) throw new Error('Failed to create listing');
      router.push('/farmers/dashboard');
    } catch (err) {
      alert('Error creating listing. Check inputs.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20 pt-8">
      <div className="mx-auto max-w-2xl px-4 sm:px-6">
        
        {step === 'PHOTO' && (
          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-xl font-bold text-slate-900 text-center mb-6">Take a photo of your produce</h2>
            
            <div className="aspect-[4/3] w-full overflow-hidden rounded-2xl bg-black relative flex items-center justify-center">
              {stream ? (
                <video ref={videoRef} autoPlay playsInline className="h-full w-full object-cover" />
              ) : (
                <div className="text-center text-slate-400">
                  <Camera className="mx-auto h-12 w-12 mb-3" />
                  <p>Camera is off</p>
                </div>
              )}
            </div>
            
            <div className="mt-6 flex flex-col gap-3">
              {stream ? (
                <button onClick={capturePhoto} className="rounded-xl bg-emerald-600 py-4 font-bold text-white hover:bg-emerald-700">
                  Capture Photo
                </button>
              ) : (
                <button onClick={startCamera} className="rounded-xl bg-slate-900 py-4 font-bold text-white hover:bg-slate-800">
                  Start Camera
                </button>
              )}
              
              <div className="relative flex items-center py-2">
                <div className="flex-grow border-t border-slate-200"></div>
                <span className="flex-shrink-0 px-4 text-sm text-slate-400">OR</span>
                <div className="flex-grow border-t border-slate-200"></div>
              </div>
              
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 py-4 font-bold text-slate-600 hover:bg-slate-50 hover:text-emerald-600">
                <Upload className="h-5 w-5" />
                Upload from Gallery
                <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
              </label>
            </div>
            
            <canvas ref={canvasRef} className="hidden" />
          </div>
        )}

        {step === 'AI_PROCESSING' && (
          <div className="flex min-h-[400px] flex-col items-center justify-center rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
            <div className="relative">
              {photoUrl && <img src={photoUrl} alt="Preview" className="h-32 w-32 rounded-2xl object-cover opacity-50" />}
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-emerald-600" />
              </div>
            </div>
            <h3 className="mt-6 text-lg font-bold text-slate-900">AI Analyzing Image...</h3>
            <p className="mt-2 text-slate-500 max-w-sm">Google Vision AI is detecting the crop type and checking for quality markers.</p>
          </div>
        )}

        {step === 'DETAILS' && (
          <form onSubmit={submitListing} className="space-y-6">
            {aiData?.aiDetectedCrop && (
              <div className="rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200 flex gap-4 items-start">
                <div className="bg-emerald-100 p-2 rounded-full mt-1">
                  <Sparkles className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <h4 className="font-bold text-emerald-900">AI Detected: {aiData.aiDetectedCrop}</h4>
                  <p className="text-sm text-emerald-700 mt-0.5">We've pre-filled the crop type for you with {(aiData.aiConfidence * 100).toFixed(0)}% confidence.</p>
                </div>
              </div>
            )}
            
            {aiData?.flagged && (
              <div className="rounded-2xl bg-red-50 p-4 ring-1 ring-red-200 flex gap-4 items-start">
                <AlertCircle className="h-5 w-5 text-red-600 mt-1 shrink-0" />
                <p className="text-sm text-red-700">Image flagged by safety filters. Manual moderation required.</p>
              </div>
            )}

            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <div className="grid gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Crop Type</label>
                  <input required type="text" value={formData.crop_type} onChange={e => setFormData({...formData, crop_type: e.target.value.toUpperCase()})} className="mt-1 w-full rounded-xl border-slate-300 p-3 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 uppercase" placeholder="e.g. TOMATO" />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700">Category</label>
                  <select required value={formData.crop_category} onChange={e => setFormData({...formData, crop_category: e.target.value})} className="mt-1 w-full rounded-xl border-slate-300 p-3 shadow-sm focus:border-emerald-500 focus:ring-emerald-500">
                    <option value="">Select Category</option>
                    <option value="VEGETABLES">Vegetables</option>
                    <option value="FRUITS">Fruits</option>
                    <option value="GRAINS">Grains</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Quantity (kg)</label>
                    <input required type="number" min="1" value={formData.quantity_kg} onChange={e => setFormData({...formData, quantity_kg: e.target.value})} className="mt-1 w-full rounded-xl border-slate-300 p-3 shadow-sm focus:border-emerald-500 focus:ring-emerald-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Price (₹/kg)</label>
                    <input required type="number" min="0.5" step="0.5" value={formData.asking_price_per_kg_inr} onChange={e => setFormData({...formData, asking_price_per_kg_inr: e.target.value})} className="mt-1 w-full rounded-xl border-slate-300 p-3 shadow-sm focus:border-emerald-500 focus:ring-emerald-500" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">Harvest Date</label>
                  <input required type="date" value={formData.harvest_date} onChange={e => setFormData({...formData, harvest_date: e.target.value})} className="mt-1 w-full rounded-xl border-slate-300 p-3 shadow-sm focus:border-emerald-500 focus:ring-emerald-500" />
                </div>

                <div>
                  <label className="flex justify-between text-sm font-medium text-slate-700">
                    <span>Description (Optional)</span>
                    <button type="button" onClick={handleVoiceInput} className="flex items-center text-emerald-600 hover:text-emerald-700">
                      <Mic className="mr-1 h-4 w-4" /> Voice Input
                    </button>
                  </label>
                  <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} rows={3} className="mt-1 w-full rounded-xl border-slate-300 p-3 shadow-sm focus:border-emerald-500 focus:ring-emerald-500" placeholder="Describe the quality, grade, or any other details..." />
                </div>

                <div className="space-y-4 pt-4 border-t border-slate-100">
                  <label className="flex items-center gap-3">
                    <input type="checkbox" checked={formData.organic} onChange={e => setFormData({...formData, organic: e.target.checked})} className="h-5 w-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600" />
                    <span className="text-slate-700">Certified Organic</span>
                  </label>
                  <label className="flex items-center gap-3">
                    <input type="checkbox" checked={formData.delivery_available} onChange={e => setFormData({...formData, delivery_available: e.target.checked})} className="h-5 w-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600" />
                    <span className="text-slate-700">I can deliver to buyer</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex gap-4">
              <button type="button" onClick={() => setStep('PHOTO')} className="flex-1 rounded-xl bg-slate-200 py-4 font-bold text-slate-700 hover:bg-slate-300">
                Back
              </button>
              <button type="submit" disabled={isSubmitting} className="flex-2 rounded-xl bg-emerald-600 px-8 py-4 font-bold text-white hover:bg-emerald-700 disabled:opacity-50 w-full">
                {isSubmitting ? 'Publishing...' : 'Publish Listing'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
