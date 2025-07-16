import * as core from '@actions/core'
import * as github from '@actions/github'
import * as artifact from '@actions/artifact'
import * as glob from '@actions/glob'
import * as path from 'path'

async function run(): Promise<void> {
    try {
        core.startGroup('🔧 Getting inputs and configuration')

        // Get inputs
        const token = core.getInput('github-token') ?? process.env.GITHUB_TOKEN
        const folderPath = core.getInput('folder-path', { required: true })
        const targetWorkflow = 175007698
        const targetRepo = "unit-tests"
        const targetOwner = "VSC-NeuroPilot"

        // Get repository name for artifact naming
        const artifactName = github.context.repo.repo

        core.info(`📁 Folder path: ${folderPath}`)
        core.info(`🏷️  Artifact name: ${artifactName}`)
        core.debug(`🎯 Target workflow: ${targetWorkflow}`)
        core.debug(`📦 Target repository: ${targetOwner}/${targetRepo}`)
        core.debug(`🔑 Token provided: ${token ? 'Yes' : 'No'}`)

        core.endGroup()

        core.startGroup('📤 Uploading artifact')
        core.debug(`Uploading folder ${folderPath} as artifact ${artifactName}`)

        // Create artifact client
        const artifactClient = new artifact.DefaultArtifactClient()
        core.debug('Artifact client created successfully')

        // Get all files in the folder
        core.info('🔍 Scanning for files to upload...')
        const globber = await glob.create(`${folderPath}/**/*`, {
            followSymbolicLinks: false
        })
        const files = await globber.glob()

        core.info(`📋 Found ${files.length} files to upload`)
        core.debug(`Files: ${files.join(', ')}`)

        if (files.length === 0) {
            throw new Error(`No files found in ${folderPath}`)
        }

        // Upload artifact
        core.info('⬆️  Starting artifact upload...')
        const uploadResponse = await artifactClient.uploadArtifact(
            artifactName,
            files,
            path.dirname(folderPath),
            {
                retentionDays: 30
            }
        )

        if (!uploadResponse.id) {
            core.setFailed("No artifact uploaded!")
            return
        }

        core.info(`✅ Artifact uploaded successfully. ID: ${uploadResponse.id}`)
        core.notice(`Artifact "${artifactName}" uploaded with ID: ${uploadResponse.id}`)

        core.endGroup()

        core.startGroup('📊 Setting outputs')

        // Set outputs
        core.setOutput('artifact-id', uploadResponse.id!.toString())
        core.setOutput('artifact-name', artifactName)
        core.setOutput('repository', `${github.context.repo.owner}/${github.context.repo.repo}`)

        core.debug(`🔗 Artifact ID: ${uploadResponse.id}`)
        core.debug(`🏷️  Artifact name: ${artifactName}`)
        core.debug(`📂 Source repository: ${github.context.repo.owner}/${github.context.repo.repo}`)

        core.endGroup()

        core.startGroup('🚀 Triggering target workflow')

        // Create GitHub client
        core.debug('Creating GitHub API client...')
        const octokit = github.getOctokit(token)

        // Prepare workflow dispatch payload
        const workflowInputs = {
            'artifact-id': uploadResponse.id!.toString(),
            'artifact-name': artifactName,
            'source-repository': `${github.context.repo.owner}/${github.context.repo.repo}`,
            'source-run-id': github.context.runId.toString(),
            'source-sha': github.context.sha
        }

        core.info(`🎯 Triggering workflow ${targetWorkflow} in ${targetOwner}/${targetRepo}`)
        core.debug(`Workflow inputs: ${JSON.stringify(workflowInputs, null, 2)}`)

        // Trigger target workflow
        core.info('📡 Sending workflow dispatch request...')
        const workflowResponse = await octokit.rest.actions.createWorkflowDispatch({
            owner: targetOwner,
            repo: targetRepo,
            workflow_id: targetWorkflow,
            ref: 'main',
            inputs: workflowInputs
        })

        core.debug(`API response status: ${workflowResponse.status}`)

        if (workflowResponse.status === 204) {
            core.info("✅ Workflow dispatch successful.")
            core.notice(`Successfully triggered workflow ${targetWorkflow} in ${targetOwner}/${targetRepo}`)
        } else {
            core.warning(`⚠️  Unexpected response status: ${workflowResponse.status}`)
            core.setFailed("Something went wrong while dispatching the workflow! " + workflowResponse.status)
        }

        core.endGroup()

    } catch (error) {
        core.endGroup() // End any open group

        core.startGroup('❌ Error handling')

        // Handle errors - status will be in error.status for HTTP errors
        if (typeof error === 'object' && error !== null && 'status' in error) {
            const err = error as { status: number, message?: string }
            core.error(`HTTP Error ${err.status}: ${err.message}`)
            core.setFailed(`HTTP Error ${err.status}: ${err.message}`)
        } else {
            const errorMessage = error instanceof Error ? error.message : String(error)
            core.error(`Unexpected error: ${errorMessage}`)
            core.setFailed(errorMessage)
        }

        // Log stack trace for debugging
        if (error instanceof Error && error.stack) {
            core.debug(`Stack trace: ${error.stack}`)
        }

        core.endGroup()
    }
}

run()