/**
 * Import Drop Zone Component
 *
 * File drop zone for import dialogs.
 */

import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-import-drop-zone',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="drop-zone"
         [class.drag-over]="isDragOver"
         [class.has-file]="file"
         [class.small]="small"
         (click)="fileInputClick.emit()"
         (dragover)="onDragOver($event)"
         (dragleave)="onDragLeave($event)"
         (drop)="onDrop($event)">

      <mat-icon *ngIf="!file">cloud_upload</mat-icon>
      <mat-icon *ngIf="file" class="success">check_circle</mat-icon>

      <p *ngIf="!file">{{ placeholder }}</p>
      <p *ngIf="file">
        <strong>{{ file.name }}</strong>
        <br *ngIf="!small">
        <span class="file-size">{{ formatFileSize(file.size) }}</span>
      </p>
    </div>
  `,
  styles: [`
    .drop-zone {
      border: 2px dashed #ccc;
      border-radius: 12px;
      padding: 40px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s;
    }

    .drop-zone:hover {
      border-color: #1976d2;
      background: #f5f5f5;
    }

    .drop-zone.drag-over {
      border-color: #1976d2;
      background: #e3f2fd;
    }

    .drop-zone.has-file {
      border-color: #4caf50;
      border-style: solid;
      background: #e8f5e9;
    }

    .drop-zone mat-icon {
      font-size: 40px;
      width: 40px;
      height: 40px;
      color: #999;
    }

    .drop-zone mat-icon.success {
      color: #4caf50;
    }

    .drop-zone p {
      margin: 12px 0 0;
      color: #666;
    }

    .file-size {
      color: #999;
      font-size: 13px;
    }

    .drop-zone.small {
      padding: 20px;
    }

    .drop-zone.small mat-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
    }

    .drop-zone.small p {
      margin: 8px 0 0;
      font-size: 13px;
    }
  `]
})
export class ImportDropZoneComponent {
  @Input() file: File | null = null;
  @Input() placeholder = 'Drop file here or click to browse';
  @Input() acceptedExtensions: string[] = ['.csv'];
  @Input() small = false;

  @Output() fileSelected = new EventEmitter<File>();
  @Output() fileInputClick = new EventEmitter<void>();

  isDragOver = false;

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;

    const files = event.dataTransfer?.files;
    if (files?.length) {
      const file = files[0];
      const isValid = this.acceptedExtensions.some(ext =>
        file.name.toLowerCase().endsWith(ext)
      );

      if (isValid) {
        this.fileSelected.emit(file);
      }
    }
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
