const { Octokit } = require("@octokit/core")
const github = require('@actions/github')
const core = require('@actions/core')
const githubToken = core.getInput('github-token')
const octokit = new Octokit({ auth: githubToken})

var major = 0
var minor = 0
var patch = 0
var contentRelease = `## What's Changed \n`

async function run (){
    if(githubToken){
        let branch_event = github.context.payload.ref.split('/')[2]
        if(branch_event == github.context.payload.repository.default_branch){
            let {id} = github.context.payload.commits[0]
            let numberPullRequest = await getNumberPullRequestByCommit(id)
            if(numberPullRequest != null){
                calculateAndPrepareContentRelease(numberPullRequest)
            }else{
                core.setFailed('Não há pull request associado a este commit!')
            }
        }else{
            core.setFailed('Esta ação só será executada quando a branch for mesclada com a branch padrão!')
        }
    }else{
        core.setFailed('O token do Github é obrigatório!')
    }
}

async function calculateAndPrepareContentRelease(numberPullRequest){
    let dataCommits = await getCommits(numberPullRequest)
    
    dataCommits.data.map(async (dataCommit)=>{
        let {commit} = dataCommit
        let {message} = commit
        countSemanticRelease(message)
    })
    
    let lastTag = await findTag()
    
    if(lastTag == null){
        if(major != 0){
            minor = 0
            patch = 0
        }
    
        if(major == 0 && minor != 0){
            patch = 0
        } 
    }

    let nextRelease = lastTag != undefined && lastTag != '' && lastTag != null ? nextTag(lastTag) : `${major}.${minor}.${patch}`
    
    let status = await gerenateReleaseNote(nextRelease, contentRelease)
    if(status == 201){
        console.log('Release note criada!')
        core.setOutput('success','Release note criada!')
    }else{
        core.setFailed('Erro ao criar release note!')
    }
}

async function getNumberPullRequestByCommit(commitSha){
    let res = await octokit.request('GET /repos/{owner}/{repo}/commits/{commit_sha}/pulls', {
        owner: github.context.payload.repository.owner.name,
        repo: github.context.payload.repository.name,
        commit_sha: commitSha
    })

    if(res.status != 200)
        return null

    return res.data.pop().number
}
async function gerenateReleaseNote(release, content){
    let res = await octokit.request('POST /repos/{owner}/{repo}/releases', {
        owner: github.context.payload.repository.owner.name,
        repo: github.context.payload.repository.name,
        tag_name: release,
        target_commitish: github.context.payload.repository.default_branch,
        name: release,
        body: content,
        draft: false,
        prerelease: false,
        generate_release_notes: false
    })

    return res.status
}

function nextTag(lastTag){
    let versions = lastTag.split('.')
    if(versions.length == 3){
        let prefix = ''

        if(versions[0].match('[v0-9]+')){
            prefix = versions[0].split(/\d/)[0]
        }

        versions[0] = versions[0].split(/([a-z]|[A-z])+\.*/).pop()
        if(major != 0){
            minor = 0
            patch = 0
            versions[1] = 0
            versions[2] = 0
        }
    
        if(major == 0 && minor != 0){
            patch = 0
            versions[2] = 0
        }

        major += Number(versions[0])  
        minor += Number(versions[1]) 
        patch += Number(versions[2])

        return `${prefix}${major}.${minor}.${patch}`
    }
}

async function findTag(){
    try{
        let param = {
            owner: github.context.payload.repository.owner.name,
            repo: github.context.payload.repository.name
        }
        let res = await octokit.request('GET /repos/{owner}/{repo}/git/refs/tags', param)
        if(res.status == 200)
            return res.data.pop().ref.split('/').pop()
    }catch(error){
        return null
    }
}

function countSemanticRelease(message){
    let length = message.split('\n')
    if(length.length >= 3 && length.pop() != '' && major == 0 ){
        contentRelease += `- ${message} \n`
        major++
    }else{
        let commitDefaultFeat = /feat+\:.*/
        let commitDefaultBuild = /build+\:.*/
        let commitDefaultChore = /chore+\:.*/
        let commitDefaultCi = /ci+\:.*/
        let commitDefaultDocs = /docs+\:.*/
        let commitDefaultStyle = /style+\:.*/
        let commitDefaultRefactor = /refactor+\:.*/
        let commitDefaultPerf = /perf+\:.*/
        let commitDefaultFix = /fix+\:.*/
        let commitDefaultHotFix = /hotfix+\:.*/
        let commitDefaultBreakingChange = /([a-z]|[A-z])+\!.*/
        
        
        
        if ((commitDefaultFeat.test(message) || commitDefaultBuild.test(message) || 
            commitDefaultChore.test(message) || commitDefaultCi.test(message) || 
            commitDefaultDocs.test(message) || commitDefaultStyle.test(message) ||
            commitDefaultRefactor.test(message) ||commitDefaultPerf.test(message)) && minor == 0){
            contentRelease += `- ${message} \n`
            minor++
        }

        if ((commitDefaultFix.test(message) || commitDefaultHotFix.test(message)) && patch == 0) {
            contentRelease += `- ${message} \n`
            patch++
        }

        if (commitDefaultBreakingChange.test(message) && major == 0) {
            contentRelease += `- ${message} \n`
            major++
        }
    }
}

async function getCommits(number){
    return octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}/commits', {
        owner: github.context.payload.repository.owner.name,
        repo: github.context.payload.repository.name,
        pull_number: number
    })

}
run()