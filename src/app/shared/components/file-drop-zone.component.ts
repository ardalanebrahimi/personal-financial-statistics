/**
 * File Drop Zone Component
 *
 * Reusable drag-and-drop file upload zone.
 */

import { Component, Input, Output, EventEmitter, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-file-drop-zone',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule],
  template: `
    <div class="drop-zone"
         [class.dragging]="isDragging"
         [class.has-file]="selectedFile"
         (click)="fileInput.click()">
      <input #fileInput
             type="file"
             [accept]="accept"
             (change)="onFileSelect($event)"
             style="display: none">

      <mat-icon class="drop-icon">{{ icon }}</mat-icon>

      <div class="drop-text" *ngIf="!selectedFile">
        <p class="primary">{{ title }}</p>
        <p class="secondary">{{ subtitle }}</p>
      </div>

      <div class="file-info" *ngIf="selectedFile">
        <mat-icon>description</mat-icon>
        <span class="file-name">{{ selectedFile.name }}</span>
        <span class="file-size">({{ formatFileSize(selectedFile.size) }})</span>
        <button mat-icon-button (click)="clearFile($event)" matTooltip="Remove file">
          <mat-icon>close</mat-icon>
        </button>
      </div>
    </div>
  `,
  styles: [`
    .drop-zone {
      border: 2px dashed #ccc;
      border-radius: 8px;
      padding: 32px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s;
    }

    .drop-zone:hover,
    .drop-zone.dragging {
      border-color: #1976d2;
      background: #e3f2fd;
    }

    .drop-zone.has-file {
      border-style: solid;
      border-color: #4caf50;
      background: #e8f5e9;
    }

    .drop-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: #9e9e9e;
      margin-bottom: 16px;
    }

    .drop-zone:hover .drop-icon,
    .drop-zone.dragging .drop-icon {
      color: #1976d2;
    }

    .drop-zone.has-file .drop-icon {
      color: #4caf50;
    }

    .drop-text .primary {
      font-size: 16px;
      font-weight: 500;
      color: #333;
      margin: 0 0 8px;
    }

    .drop-text .secondary {
      font-size: 14px;
      color: #666;
      margin: 0;
    }

    .file-info {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    .file-info mat-icon {
      color: #4caf50;
    }

    .file-name {
      font-weight: 500;
    }

    .file-size {
      color: #666;
      font-size: 14px;
    }
  `]
})
export class FileDropZoneComponent {
  @Input() title = 'Drop file here or click to browse';
  @Input() subtitle = 'Supported formats: CSV, TXT';
  @Input() accept = '.csv,.txt';
  @Input() icon = 'cloud_upload';
  @Output() fileSelected = new EventEmitter<File>();

  isDragging = false;
  selectedFile: File | null = null;

  @HostListener('dragover', ['$event'])
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = true;
  }

  @HostListener('dragleave', ['$event'])
  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;
  }

  @HostListener('drop', ['$event'])
  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;

    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      this.handleFile(event.dataTransfer.files[0]);
    }
  }

  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.handleFile(input.files[0]);
    }
  }

  private handleFile(file: File): void {
    this.selectedFile = file;
    this.fileSelected.emit(file);
  }

  clearFile(event: Event): void {
    event.stopPropagation();
    this.selectedFile = null;
    this.fileSelected.emit(undefined as any);
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
}
